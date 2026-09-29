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

test("return the user deletion placeholder", async () => {
  const response = await request(app)
    .delete(`/api/user/${user.id}`)
    .set("Authorization", `Bearer ${userToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ message: "not implemented" });
});

test("return the user listing placeholder", async () => {
  const response = await request(app)
    .get("/api/user")
    .set("Authorization", `Bearer ${userToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    message: "not implemented",
    users: [],
    more: false,
  });
});
