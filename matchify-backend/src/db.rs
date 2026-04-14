use crate::config::AppConfig;
use crate::error::Result;
use mongodb::bson::doc;
use mongodb::{Client, Database};

pub async fn get_mongo_database(config: &AppConfig) -> Result<Database> {
    let client = Client::with_uri_str(&config.mongo_uri).await?;
    let db = client.database(&config.mongo_db);
    db.run_command(doc! { "ping": 1 }).await?;
    tracing::info!("Successfully connected to MongoDB");
    Ok(db)
}
