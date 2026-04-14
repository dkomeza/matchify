use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub mongo_uri: String,
    pub encryption_key: String,
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

        Self {
            port,
            mongo_uri,
            encryption_key,
        }
    }
}
