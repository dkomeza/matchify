use async_graphql::Object;

pub struct Query;

#[Object]
impl Query {
    async fn hello(&self) -> &str {
        "Hello from Rust!"
    }
}
