#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct SpotifyTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct SpotifyImage {
    pub url: String,
    pub height: Option<u32>,
    pub width: Option<u32>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct SpotifyProfile {
    pub id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    #[serde(default)]
    pub images: Vec<SpotifyImage>,
}

#[derive(Debug, Clone, async_graphql::SimpleObject, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyTrack {
    pub spotify_track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art_url: String,
    pub preview_url: Option<String>,
    pub duration_ms: i32,
}