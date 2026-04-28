use mongodb::{bson::{doc, oid::ObjectId}, Database};
use futures::stream::StreamExt;
use std::collections::HashMap;

use crate::error::{AppError, Result};
use crate::model::{
    PlaylistStats, MemberStat, User, SongGql,
    playlist::Playlist,
    song::Song
};

pub async fn get_playlist_stats(db: &Database, playlist_id: ObjectId) -> Result<PlaylistStats> {
    let playlists_coll = db.collection::<Playlist>("playlists");
    let playlist = playlists_coll.find_one(doc! { "_id": playlist_id }).await?
        .ok_or_else(|| AppError::NotFound("Playlist not found".into()))?;

    let songs_coll = db.collection::<Song>("songs");
    let users_coll = db.collection::<User>("users");

    // Aggregation pipeline joining songs, votes, and users
    let pipeline = vec![
        // Stage 1: Filter songs by playlist_id
        doc! { "$match": { "playlist_id": playlist_id } },
        
        // Stage 2: Join all votes per song
        doc! { "$lookup": {
            "from": "votes",
            "localField": "_id",
            "foreignField": "song_id",
            "as": "votes"
        }},

        // Stage 3: Resolve proposedBy (join users)
        doc! { "$lookup": {
            "from": "users",
            "localField": "proposed_by",
            "foreignField": "_id",
            "as": "proposed_by_user"
        }},

        // Stage 4: Group per-song stats and playlist-level totals
        doc! { "$group": {
            "_id": "$playlist_id",
            "totalProposals": { "$sum": 1 },
            "approvedCount": { "$sum": { "$cond": [{ "$eq": ["$status", "Approved"] }, 1, 0] } },
            "pendingCount": { "$sum": { "$cond": [{ "$eq": ["$status", "Pending"] }, 1, 0] } },
            "skippedCount": { "$sum": { "$cond": [{ "$eq": ["$status", "Skipped"] }, 1, 0] } },
            "totalVotesCast": { "$sum": { "$size": "$votes" } },
            "songs": { "$push": "$$ROOT" }
        }},
        
        // Stage 5: Project into PlaylistStats shape (partial, we will complete in Rust for full member participation)
        doc! { "$project": {
            "totalProposals": 1,
            "approvedCount": 1,
            "pendingCount": 1,
            "skippedCount": 1,
            "totalVotesCast": 1,
            "songs": 1
        }}
    ];

    let mut cursor = songs_coll.aggregate(pipeline).await?;
    
    let doc = if let Some(result) = cursor.next().await {
        result?
    } else {
        // Zero state case when playlist has no songs
        let mut member_participation = Vec::new();
        let mut users_cursor = users_coll.find(doc! { "_id": { "$in": &playlist.member_ids } }).await?;
        while let Some(user_res) = users_cursor.next().await {
            member_participation.push(MemberStat {
                user: user_res?,
                votes_cast: 0,
                tracks_proposed: 0,
                participation_rate: 0.0,
            });
        }
        return Ok(PlaylistStats {
            playlist_id: playlist_id.to_hex(),
            total_proposals: 0,
            approved_count: 0,
            pending_count: 0,
            skipped_count: 0,
            approval_rate: 0.0,
            total_votes_cast: 0,
            member_participation,
            top_proposals: vec![],
        });
    };

    let total_proposals = doc.get_i32("totalProposals").unwrap_or(0);
    let approved_count = doc.get_i32("approvedCount").unwrap_or(0);
    let pending_count = doc.get_i32("pendingCount").unwrap_or(0);
    let skipped_count = doc.get_i32("skippedCount").unwrap_or(0);
    let total_votes_cast = doc.get_i32("totalVotesCast").unwrap_or(0);
    let approval_rate = if total_proposals > 0 {
        approved_count as f64 / total_proposals as f64
    } else {
        0.0
    };

    let songs_array = doc.get_array("songs").unwrap_or(&vec![]).clone();
    
    let mut proposals_by_user = HashMap::new();
    let mut votes_by_user = HashMap::new();
    let mut top_songs: Vec<Song> = Vec::new();

    for song_bson in songs_array {
        if let mongodb::bson::Bson::Document(song_doc) = song_bson {
            // Count proposals
            if let Ok(proposed_by) = song_doc.get_object_id("proposed_by") {
                *proposals_by_user.entry(proposed_by).or_insert(0) += 1;
            }

            // Count votes
            if let Ok(votes) = song_doc.get_array("votes") {
                for vote_bson in votes {
                    if let mongodb::bson::Bson::Document(vote_doc) = vote_bson {
                        if let Ok(user_id) = vote_doc.get_object_id("user_id") {
                            *votes_by_user.entry(user_id).or_insert(0) += 1;
                        }
                    }
                }
            }
            
            // Collect pending songs for top proposals
            if let Ok(song) = mongodb::bson::from_document::<Song>(song_doc.clone()) {
                if song.status == crate::model::song::TrackStatus::Pending {
                    top_songs.push(song);
                }
            }
        }
    }

    // Sort top proposals by like_count DESC
    top_songs.sort_by(|a, b| b.like_count.cmp(&a.like_count));

    let top_proposals = top_songs.into_iter().map(SongGql::from).collect();

    // Calculate per-member participation including all members
    let mut member_participation = Vec::new();
    let mut users_cursor = users_coll.find(doc! { "_id": { "$in": &playlist.member_ids } }).await?;
    
    while let Some(user_res) = users_cursor.next().await {
        let user = user_res?;
        let user_id = user.id;
        
        let votes_cast = *votes_by_user.get(&user_id).unwrap_or(&0) as i32;
        let tracks_proposed = *proposals_by_user.get(&user_id).unwrap_or(&0) as i32;
        let participation_rate = if total_proposals > 0 {
            votes_cast as f64 / total_proposals as f64
        } else {
            0.0
        };

        member_participation.push(MemberStat {
            user,
            votes_cast,
            tracks_proposed,
            participation_rate,
        });
    }

    Ok(PlaylistStats {
        playlist_id: playlist_id.to_hex(),
        total_proposals,
        approved_count,
        pending_count,
        skipped_count,
        approval_rate,
        total_votes_cast,
        member_participation,
        top_proposals,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::{bson::{doc, oid::ObjectId}, Client, Database};
    use chrono::Utc;
    use dotenvy::dotenv;
    use crate::model::{User, playlist::Playlist, song::{Song, TrackStatus}, vote::{Vote, VoteType}};

    async fn setup_db() -> Database {
        dotenv().ok();
        let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "mongodb://localhost:27017".into());
        let client = Client::with_uri_str(&db_url).await.unwrap();
        let db = client.database("matchify_test_stats");
        db.drop().await.unwrap();
        db
    }

    #[tokio::test]
    async fn test_playlist_stats_aggregation() {
        let db = setup_db().await;

        let user1_id = ObjectId::new();
        let user2_id = ObjectId::new();
        let user3_id = ObjectId::new();

        let users_coll = db.collection::<User>("users");
        users_coll.insert_many(vec![
            User {
                id: user1_id,
                spotify_id: "s1".into(),
                display_name: "User 1".into(),
                email: "u1@e.com".into(),
                profile_image_url: None,
                access_token: "t".into(),
                refresh_token: "t".into(),
                token_expires_at: Utc::now(),
                created_at: Utc::now(),
            },
            User {
                id: user2_id,
                spotify_id: "s2".into(),
                display_name: "User 2".into(),
                email: "u2@e.com".into(),
                profile_image_url: None,
                access_token: "t".into(),
                refresh_token: "t".into(),
                token_expires_at: Utc::now(),
                created_at: Utc::now(),
            },
            User {
                id: user3_id,
                spotify_id: "s3".into(),
                display_name: "User 3".into(),
                email: "u3@e.com".into(),
                profile_image_url: None,
                access_token: "t".into(),
                refresh_token: "t".into(),
                token_expires_at: Utc::now(),
                created_at: Utc::now(),
            }
        ]).await.unwrap();

        let playlist_id = ObjectId::new();
        let playlist_coll = db.collection::<Playlist>("playlists");
        playlist_coll.insert_one(Playlist {
            id: playlist_id,
            name: "Test Playlist".into(),
            description: None,
            owner_id: user1_id,
            member_ids: vec![user1_id, user2_id, user3_id],
            invite_code: "12345678".into(),
            vote_threshold: 2,
            spotify_playlist_id: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }).await.unwrap();

        let song1_id = ObjectId::new();
        let song2_id = ObjectId::new();
        let song3_id = ObjectId::new();

        let songs_coll = db.collection::<Song>("songs");
        songs_coll.insert_many(vec![
            Song {
                id: song1_id,
                playlist_id,
                spotify_track_id: "t1".into(),
                title: "Song 1".into(),
                artist: "A".into(),
                album: "A".into(),
                album_art_url: "u".into(),
                preview_url: None,
                duration_ms: 1000,
                proposed_by: user1_id,
                status: TrackStatus::Approved,
                like_count: 2,
                created_at: Utc::now(),
            },
            Song {
                id: song2_id,
                playlist_id,
                spotify_track_id: "t2".into(),
                title: "Song 2".into(),
                artist: "A".into(),
                album: "A".into(),
                album_art_url: "u".into(),
                preview_url: None,
                duration_ms: 1000,
                proposed_by: user2_id,
                status: TrackStatus::Skipped,
                like_count: 0,
                created_at: Utc::now(),
            },
            Song {
                id: song3_id,
                playlist_id,
                spotify_track_id: "t3".into(),
                title: "Song 3".into(),
                artist: "A".into(),
                album: "A".into(),
                album_art_url: "u".into(),
                preview_url: None,
                duration_ms: 1000,
                proposed_by: user1_id,
                status: TrackStatus::Pending,
                like_count: 1,
                created_at: Utc::now(),
            }
        ]).await.unwrap();

        let votes_coll = db.collection::<Vote>("votes");
        votes_coll.insert_many(vec![
            Vote {
                id: ObjectId::new(),
                song_id: song1_id,
                playlist_id,
                user_id: user1_id,
                vote: VoteType::Like,
                created_at: Utc::now(),
            },
            Vote {
                id: ObjectId::new(),
                song_id: song1_id,
                playlist_id,
                user_id: user2_id,
                vote: VoteType::Like,
                created_at: Utc::now(),
            },
            Vote {
                id: ObjectId::new(),
                song_id: song2_id,
                playlist_id,
                user_id: user1_id,
                vote: VoteType::Skip,
                created_at: Utc::now(),
            },
            Vote {
                id: ObjectId::new(),
                song_id: song3_id,
                playlist_id,
                user_id: user2_id,
                vote: VoteType::Like,
                created_at: Utc::now(),
            }
        ]).await.unwrap();

        let stats = get_playlist_stats(&db, playlist_id).await.expect("Failed to get stats");

        assert_eq!(stats.playlist_id, playlist_id.to_hex());
        assert_eq!(stats.total_proposals, 3);
        assert_eq!(stats.approved_count, 1);
        assert_eq!(stats.skipped_count, 1);
        assert_eq!(stats.pending_count, 1);
        assert_eq!(stats.total_votes_cast, 4);

        let expected_approval_rate = 1.0 / 3.0;
        assert!((stats.approval_rate - expected_approval_rate).abs() < f64::EPSILON);

        assert_eq!(stats.member_participation.len(), 3);
        
        let mut u1_stat = None;
        let mut u2_stat = None;
        let mut u3_stat = None;

        for m in &stats.member_participation {
            if m.user.id == user1_id { u1_stat = Some(m); }
            if m.user.id == user2_id { u2_stat = Some(m); }
            if m.user.id == user3_id { u3_stat = Some(m); }
        }

        let u1 = u1_stat.unwrap();
        assert_eq!(u1.votes_cast, 2);
        assert_eq!(u1.tracks_proposed, 2);
        assert!((u1.participation_rate - (2.0 / 3.0)).abs() < f64::EPSILON);

        let u2 = u2_stat.unwrap();
        assert_eq!(u2.votes_cast, 2);
        assert_eq!(u2.tracks_proposed, 1);

        let u3 = u3_stat.unwrap();
        assert_eq!(u3.votes_cast, 0);
        assert_eq!(u3.tracks_proposed, 0);
        assert_eq!(u3.participation_rate, 0.0);

        assert_eq!(stats.top_proposals.len(), 1);
        assert_eq!(stats.top_proposals[0].id, song3_id.to_hex());
        assert_eq!(stats.top_proposals[0].like_count, 1);
    }
}
