#[derive(serde::Deserialize)]
pub struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

#[derive(serde::Deserialize)]
pub struct SpotifyUser {
    id: String,
    email: Option<String>,
    display_name: Option<String>,
}