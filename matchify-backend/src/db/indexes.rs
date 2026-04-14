use mongodb::{
    bson::doc,
    options::IndexOptions,
    Database, IndexModel,
};

pub async fn create_indexes(db: &Database) -> mongodb::error::Result<()> {
    // users
    let user_idx = IndexModel::builder()
        .keys(doc! { "spotify_id": 1 })
        .options(IndexOptions::builder().unique(true).build())
        .build();
    db.collection::<mongodb::bson::Document>("users")
        .create_index(user_idx)
        .await?;

    // playlists
    let playlist_idx = IndexModel::builder()
        .keys(doc! { "invite_code": 1 })
        .options(IndexOptions::builder().unique(true).build())
        .build();
    db.collection::<mongodb::bson::Document>("playlists")
        .create_index(playlist_idx)
        .await?;

    // songs
    let song_status_idx = IndexModel::builder()
        .keys(doc! { "playlist_id": 1, "status": 1 })
        .build();
    let song_unique_idx = IndexModel::builder()
        .keys(doc! { "playlist_id": 1, "spotify_track_id": 1 })
        .options(IndexOptions::builder().unique(true).build())
        .build();
    db.collection::<mongodb::bson::Document>("songs")
        .create_indexes([song_status_idx, song_unique_idx])
        .await?;

    // votes
    let vote_idx = IndexModel::builder()
        .keys(doc! { "song_id": 1, "user_id": 1 })
        .options(IndexOptions::builder().unique(true).build())
        .build();
    db.collection::<mongodb::bson::Document>("votes")
        .create_index(vote_idx)
        .await?;

    tracing::info!("MongoDB indexes created or verified");
    Ok(())
}
