use async_graphql::SimpleObject;
use crate::model::user::User;
use crate::model::song::SongGql;

#[derive(Debug, SimpleObject)]
pub struct PlaylistStats {
    pub playlist_id: String,
    pub total_proposals: i32,
    pub approved_count: i32,
    pub pending_count: i32,
    pub skipped_count: i32,
    pub approval_rate: f64,
    pub total_votes_cast: i32,
    pub member_participation: Vec<MemberStat>,
    pub top_proposals: Vec<SongGql>,
}

#[derive(Debug, SimpleObject)]
pub struct MemberStat {
    pub user: User,
    pub votes_cast: i32,
    pub tracks_proposed: i32,
    pub participation_rate: f64,
}
