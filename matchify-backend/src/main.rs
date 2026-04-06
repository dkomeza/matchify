use axum::{Router, routing::get};
use mongodb::bson::doc;

mod model;

#[tokio::main]
async fn main() {
    let _ = dotenv::dotenv();

    let db = get_mongo_database().await;
    let app = Router::new().route("/", get(|| async { "Hello, World!" }));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8082").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn get_mongo_database() -> mongodb::Database {
    let mongo_uri = std::env::var("MONGO_URI").expect("MONGO_URI must be set");
    let mongo_database = std::env::var("MONGO_DB").expect("MONGO_DATABASE must be set");

    let client = mongodb::Client::with_uri_str(&mongo_uri).await.unwrap();
    let db = client.database(&mongo_database);
    db.run_command(doc! { "ping": 1}).await.unwrap();
    println!("Successfully connected to MongoDB");

    db
}
