use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub mongo_uri: String,
    pub encryption_key: String,
    pub jwt_secret: String,
    pub spotify_client_id: String,
    pub spotify_client_secret: String,
}

impl AppConfig {
    pub fn init() -> Self {
        match dotenvy::dotenv() {
            Ok(_) => tracing::debug!(".env file loaded"),
            Err(_) => tracing::debug!("No .env file found, relying on environment variables"),
        }

        let port = std::env::var("PORT")
            .unwrap_or_else(|_| "8082".to_string())
            .parse::<u16>()
            .expect("PORT must be a valid u16 number");

        let mongo_uri = std::env::var("MONGO_URI").expect("MONGO_URI must be set");
        let encryption_key = std::env::var("ENCRYPTION_KEY").expect("ENCRYPTION_KEY must be set");
        let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");
        let spotify_client_id = std::env::var("SPOTIFY_CLIENT_ID").expect("SPOTIFY_CLIENT_ID must be set");
        let spotify_client_secret = std::env::var("SPOTIFY_CLIENT_SECRET").expect("SPOTIFY_CLIENT_SECRET must be set");

        if jwt_secret.len() < 32 {
            panic!("JWT_SECRET must be at least 32 characters long");
        }

        Self {
            port,
            mongo_uri,
            encryption_key,
            jwt_secret,
            spotify_client_id,
            spotify_client_secret,
        }
    }
}
