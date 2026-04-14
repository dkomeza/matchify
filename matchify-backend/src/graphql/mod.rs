pub mod mutation;
pub mod query;
pub mod subscription;

use async_graphql::{EmptySubscription, Schema};
use mutation::Mutation;
use query::Query;

pub type AppSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema() -> AppSchema {
    Schema::build(Query, Mutation, EmptySubscription).finish()
}
