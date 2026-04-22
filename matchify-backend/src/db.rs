use mongodb::{Client, options::ClientOptions, bson::doc};
pub mod indexes;

pub async fn connect(uri: &str) -> mongodb::error::Result<Client> {
    let client_options = ClientOptions::parse(uri).await?;
    // You can customize options here if needed
    let client = Client::with_options(client_options)?;
    
    // Ping to verify connection
    client
        .database("matchify")
        .run_command(doc! { "ping": 1 })
        .await?;
        
    tracing::info!("Successfully connected to MongoDB");
    Ok(client)
}
