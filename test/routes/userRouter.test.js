const request = require("supertest");
const { randomName } = require("../helpers");
const app = require("../../src/service");
const { DB, Role } = require("../../src/database/database.js");

let adminToken;
let userToken;
let user;
let otherUser;

beforeAll(async () => {
  await DB.initialized;

  const admin = {
    name: "user test admin",
    email: `${randomName()}@test.com`,
    password: "admin-password",
    roles: [{ role: Role.Admin }],
  };
  await DB.addUser(admin);
  const adminLogin = await request(app).put("/api/auth").send({
    email: admin.email,
    password: admin.password,
  });
  adminToken = adminLogin.body.token;

  user = {
    name: "user test diner",
    email: `${randomName()}@test.com`,
    password: "diner-password",
  };
  const userRegister = await request(app).post("/api/auth").send(user);
  user.id = userRegister.body.user.id;
  userToken = userRegister.body.token;

  otherUser = {
    name: "other test diner",
    email: `${randomName()}@test.com`,
    password: "other-password",
  };
  const otherUserRegister = await request(app)
    .post("/api/auth")
    .send(otherUser);
  otherUser.id = otherUserRegister.body.user.id;
});

test("get the authenticated user", async () => {
  const response = await request(app)
    .get("/api/user/me")
    .set("Authorization", `Bearer ${userToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    id: user.id,
    name: user.name,
    email: user.email,
    roles: [{ role: Role.Diner }],
  });
  expect(response.body.password).toBeUndefined();
});

test("reject unauthenticated profile lookup", async () => {
  const response = await request(app).get("/api/user/me");

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("unauthorized");
});

test("user updates their own profile", async () => {
  const updatedUser = {
    name: "updated diner",
    email: `${randomName()}@test.com`,
    password: "updated-password",
  };
  const response = await request(app)
    .put(`/api/user/${user.id}`)
    .set("Authorization", `Bearer ${userToken}`)
    .send(updatedUser);

  expect(response.status).toBe(200);
  expect(response.body.user).toMatchObject({
    id: user.id,
    name: updatedUser.name,
    email: updatedUser.email,
    roles: [{ role: Role.Diner }],
  });
  expect(response.body.token).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );

  const loginResponse = await request(app).put("/api/auth").send({
    email: updatedUser.email,
    password: updatedUser.password,
  });
  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.user).toMatchObject({
    id: user.id,
    name: updatedUser.name,
    email: updatedUser.email,
  });
});

test("user can keep the same email when updating their own profile", async () => {
  const [userToUpdate, userToUpdateToken] = await registerUser(request(app));
  const response = await request(app)
    .put(`/api/user/${userToUpdate.id}`)
    .set("Authorization", "Bearer " + userToUpdateToken)
    .send({ name: "same email user", email: userToUpdate.email });

  expect(response.status).toBe(200);
  expect(response.body.user).toMatchObject({
    id: userToUpdate.id,
    name: "same email user",
    email: userToUpdate.email,
  });
});

test("reject updating a user with an email already in use", async () => {
  const response = await request(app)
    .put(`/api/user/${user.id}`)
    .set("Authorization", `Bearer ${userToken}`)
    .send({ email: otherUser.email });

  expect(response.status).toBe(409);
  expect(response.body.message).toBe("email already exists");
});

test("admin updates another user", async () => {
  const response = await request(app)
    .put(`/api/user/${otherUser.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "admin updated user" });

  expect(response.status).toBe(200);
  expect(response.body.user).toMatchObject({
    id: otherUser.id,
    name: "admin updated user",
    email: otherUser.email,
  });
});

test("reject user updating another user's profile", async () => {
  const response = await request(app)
    .put(`/api/user/${otherUser.id}`)
    .set("Authorization", `Bearer ${userToken}`)
    .send({ name: "not authorized" });

  expect(response.status).toBe(403);
  expect(response.body.message).toBe("unauthorized");
});

test("reject unauthenticated profile updates", async () => {
  const response = await request(app)
    .put(`/api/user/${user.id}`)
    .send({ name: "not authorized" });

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("unauthorized");
});

test("delete user", async () => {
  const response = await request(app)
    .delete(`/api/user/${user.id}`)
    .set("Authorization", `Bearer ${userToken}`);

  expect(response.status).toBe(200);
  expect(response.body.message).toBe("user deleted");

  const loginResponse = await request(app).put("/api/auth").send({
    email: user.email,
    password: user.password,
  });
  expect(loginResponse.status).toBe(404);
  expect(loginResponse.body.message).toBe("unknown user");
});

test("silently don't delete nonexistent user", async () => {
  const response = await request(app)
    .delete("/api/user/2147483647")
    .set("Authorization", `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.message).toBe("user deleted");
});

test("list users unauthorized", async () => {
  const listUsersRes = await request(app).get("/api/user");
  expect(listUsersRes.status).toBe(401);
});

test("list users", async () => {
  const [user, userToken] = await registerUser(request(app));

  // fix lint error: 'user' is assigned a value but never used
  expect(user).toEqual(user);

  const listUsersRes = await request(app)
    .get("/api/user")
    .set("Authorization", "Bearer " + userToken);
  expect(listUsersRes.status).toBe(403);

  const listUsersAdminRes = await request(app)
    .get("/api/user")
    .query({ name: user.name })
    .set("Authorization", "Bearer " + adminToken);
  expect(listUsersAdminRes.status).toBe(200);
  expect(listUsersAdminRes.body.users).toHaveLength(1);
  expect(listUsersAdminRes.body.users[0]).toMatchObject({
    id: user.id,
    name: user.name,
    email: user.email,
    roles: [{ role: Role.Diner }],
  });
  expect(listUsersAdminRes.body.more).toBe(false);
});

async function registerUser(service) {
  const testUser = {
    name: `pizza diner ${randomName()}`,
    email: `${randomName()}@test.com`,
    password: "a",
  };
  const registerRes = await service.post("/api/auth").send(testUser);
  return [registerRes.body.user, registerRes.body.token];
}
