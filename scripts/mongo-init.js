db = db.getSiblingDB("matchify");

db.createUser({
  user: "matchify_user",
  pwd: "password",
  roles: [
    {
      role: "readWrite",
      db: "matchify"
    }
  ]
});