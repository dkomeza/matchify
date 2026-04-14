use async_graphql::Object;

pub struct Mutation;

#[Object]
impl Mutation {
    async fn ping(&self) -> &str {
        "pong"
    }
}
