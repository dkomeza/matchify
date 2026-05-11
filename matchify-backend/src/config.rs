use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub mongo_uri: String,
    pub encryption_key: String,
    pub jwt_secret: String,
    pub spotify_client_id: String,
    pub spotify_client_secret: String,
    pub lastfm_api_key: String,
}

fn validate_encryption_key(encryption_key: String) -> String {
    if encryption_key.len() != 32 {
        panic!("ENCRYPTION_KEY must be exactly 32 bytes");
    }

    encryption_key
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
        let encryption_key = validate_encryption_key(
            std::env::var("ENCRYPTION_KEY").expect("ENCRYPTION_KEY must be set"),
        );
        let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");
        let spotify_client_id =
            std::env::var("SPOTIFY_CLIENT_ID").expect("SPOTIFY_CLIENT_ID must be set");
        let spotify_client_secret =
            std::env::var("SPOTIFY_CLIENT_SECRET").expect("SPOTIFY_CLIENT_SECRET must be set");
        let lastfm_api_key = std::env::var("LASTFM_API_KEY")
            .expect("LASTFM_API_KEY must be set for playlist recommendations");

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
            lastfm_api_key,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::validate_encryption_key;

    #[test]
    fn accepts_32_byte_encryption_key() {
        let key = "a".repeat(32);

        assert_eq!(validate_encryption_key(key.clone()), key);
    }

    #[test]
    #[should_panic(expected = "ENCRYPTION_KEY must be exactly 32 bytes")]
    fn rejects_non_32_byte_encryption_key() {
        validate_encryption_key("not-32-bytes".to_string());
    }
}
