use mongodb::ClientSession;
fn test(session: &mut ClientSession) {
    let _ = session.start_transaction();
}
