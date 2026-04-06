#[derive(serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

#[derive(serde::Deserialize)]
struct SpotifyUser {
    id: String,
    email: Option<String>,
    display_name: Option<String>,
}