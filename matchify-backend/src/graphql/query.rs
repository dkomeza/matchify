use async_graphql::{Context, Object, Result as GraphqlResult};
use mongodb::{bson::doc, Database};
use std::str::FromStr;

use crate::{
    error::{AppError, Result},
    jwt::AuthUser,
    model::user::User,
};

pub struct Query;

#[Object]
impl Query {
    async fn me(&self, ctx: &Context<'_>) -> GraphqlResult<User> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| async_graphql::Error::new("UNAUTHENTICATED"))?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let collection = db.collection::<User>("users");

        let object_id = mongodb::bson::oid::ObjectId::from_str(&auth_user.user_id)
            .map_err(|_| async_graphql::Error::new("UNAUTHENTICATED"))?;

        let user = collection
            .find_one(doc! { "_id": object_id })
            .await
            .map_err(|_| AppError::Unexpected)?
            .ok_or_else(|| async_graphql::Error::new("UNAUTHENTICATED"))?;

        Ok(user)
    }
}
