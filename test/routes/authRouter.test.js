const request = require("supertest");
const { randomName } = require("../helpers");
const app = require("../../src/service");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = randomName() + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

test("register new user", async () => {
  const newUser = { ...testUser, email: randomName() + "@test.com" };
  const registerRes = await request(app).post("/api/auth").send(newUser);
  expect(registerRes.status).toBe(201);
  expectValidJwt(registerRes.body.token);
});

test("reject duplicate registration", async () => {
  const registerRes = await request(app).post("/api/auth").send(testUser);
  expect(registerRes.status).toBe(409);
  expect(registerRes.body.message).toBe("user already exists");
});

test("login", async () => {
  const loginRes = await request(app).put("/api/auth").send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: "diner" }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test("reject failed login", async () => {
  const loginRes = await request(app)
    .put("/api/auth")
    .send({ email: testUser.email, password: "wrong-password" });

  expect(loginRes.status).toBe(404);
  expect(loginRes.body.message).toBe("unknown user");
});

test("logout", async () => {
  const logoutRes = await request(app)
    .delete("/api/auth")
    .set("Authorization", `Bearer ${testUserAuthToken}`);

  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe("logout successful");
});

test("reject unauthenticated logout", async () => {
  const logoutRes = await request(app).delete("/api/auth");

  expect(logoutRes.status).toBe(401);
  expect(logoutRes.body.message).toBe("unauthorized");
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );
}
