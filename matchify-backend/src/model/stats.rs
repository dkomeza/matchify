use crate::model::song::SongGql;
use crate::model::user::User;
use async_graphql::SimpleObject;

#[derive(Debug, SimpleObject)]
pub struct HomeReport {
    pub overview: PersonalOverviewStats,
    pub playlist_health: Vec<PlaylistHealthStat>,
    pub active_members: Vec<ActiveMemberStat>,
    pub top_artists: Vec<ArtistStat>,
    pub pending_tracks: Vec<PendingTrackInsight>,
}

#[derive(Debug, SimpleObject)]
pub struct PersonalOverviewStats {
    pub joined_playlists: i32,
    pub tracks_proposed_by_me: i32,
    pub votes_cast_by_me: i32,
    pub approved_tracks_from_my_proposals: i32,
    pub my_approval_rate: f64,
}

#[derive(Debug, SimpleObject)]
pub struct PlaylistHealthStat {
    pub playlist_id: String,
    pub name: String,
    pub total_proposals: i32,
    pub approved_count: i32,
    pub pending_count: i32,
    pub skipped_count: i32,
    pub approval_rate: f64,
    pub total_votes_cast: i32,
    pub average_votes_per_proposal: f64,
}

#[derive(Debug, SimpleObject)]
pub struct ActiveMemberStat {
    pub user: User,
    pub votes_cast: i32,
    pub tracks_proposed: i32,
    pub participation_rate: f64,
}

#[derive(Debug, SimpleObject)]
pub struct ArtistStat {
    pub artist: String,
    pub approved_tracks: i32,
    pub average_duration_ms: f64,
}

#[derive(Debug, SimpleObject)]
pub struct PendingTrackInsight {
    pub track: SongGql,
    pub playlist_id: String,
    pub playlist_name: String,
    pub vote_threshold: i32,
    pub likes_needed: i32,
    pub skip_votes: i32,
}

#[derive(Debug, SimpleObject)]
pub struct PlaylistStats {
    pub playlist_id: String,
    pub total_proposals: i32,
    pub approved_count: i32,
    pub pending_count: i32,
    pub skipped_count: i32,
    pub approval_rate: f64,
    pub total_votes_cast: i32,
    pub member_participation: Vec<MemberStat>,
    pub top_proposals: Vec<SongGql>,
}

#[derive(Debug, SimpleObject)]
pub struct MemberStat {
    pub user: User,
    pub votes_cast: i32,
    pub tracks_proposed: i32,
    pub participation_rate: f64,
}
