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