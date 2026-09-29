const request = require("supertest");
const { randomName } = require("../helpers");
const app = require("../../src/service");
const { DB, Role } = require("../../src/database/database.js");

let adminToken;
let franchiseeToken;
let dinerToken;
let franchisee;
let testFranchise;

beforeAll(async () => {
  const admin = {
    name: "franchise test admin",
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

  franchisee = {
    name: "franchise test owner",
    email: `${randomName()}@test.com`,
    password: "franchisee-password",
  };
  const franchiseeRegister = await request(app)
    .post("/api/auth")
    .send(franchisee);
  franchiseeToken = franchiseeRegister.body.token;

  const diner = {
    name: "franchise test diner",
    email: `${randomName()}@test.com`,
    password: "diner-password",
  };
  const dinerRegister = await request(app).post("/api/auth").send(diner);
  dinerToken = dinerRegister.body.token;

  const franchiseResponse = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [{ email: franchisee.email }] });
  testFranchise = franchiseResponse.body;
});

test("list franchises", async () => {
  const response = await request(app)
    .get("/api/franchise")
    .query({ name: testFranchise.name });

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty("franchises");
  expect(response.body).toHaveProperty("more");
  expect(response.body.franchises).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: testFranchise.id,
        name: testFranchise.name,
      }),
    ]),
  );
});

test("reject unauthenticated user franchise lookup", async () => {
  const response = await request(app).get(`/api/franchise/${testFranchise.id}`);

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("unauthorized");
});

test("list a user's franchises", async () => {
  const response = await request(app)
    .get(`/api/franchise/${franchiseeRegisterId()}`)
    .set("Authorization", `Bearer ${franchiseeToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: testFranchise.id,
        name: testFranchise.name,
      }),
    ]),
  );
});

test("admin creates a franchise", async () => {
  const response = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [{ email: franchisee.email }] });

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    name: expect.any(String),
    admins: [
      expect.objectContaining({
        email: franchisee.email,
        name: franchisee.name,
      }),
    ],
  });
  expect(response.body.id).toEqual(expect.any(Number));
});

test("reject non-admin franchise creation", async () => {
  const response = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${franchiseeToken}`)
    .send({ name: randomName(), admins: [{ email: franchisee.email }] });

  expect(response.status).toBe(403);
  expect(response.body.message).toBe("unable to create a franchise");
});

test("franchise admin creates and deletes a store", async () => {
  const createResponse = await request(app)
    .post(`/api/franchise/${testFranchise.id}/store`)
    .set("Authorization", `Bearer ${franchiseeToken}`)
    .send({ name: randomName() });

  expect(createResponse.status).toBe(200);
  expect(createResponse.body).toMatchObject({
    id: expect.any(Number),
    franchiseId: testFranchise.id,
    name: expect.any(String),
  });

  const deleteResponse = await request(app)
    .delete(
      `/api/franchise/${testFranchise.id}/store/${createResponse.body.id}`,
    )
    .set("Authorization", `Bearer ${franchiseeToken}`);

  expect(deleteResponse.status).toBe(200);
  expect(deleteResponse.body.message).toBe("store deleted");
});

test("reject diner store creation", async () => {
  const response = await request(app)
    .post(`/api/franchise/${testFranchise.id}/store`)
    .set("Authorization", `Bearer ${dinerToken}`)
    .send({ name: randomName() });

  expect(response.status).toBe(403);
  expect(response.body.message).toBe("unable to create a store");
});

test("delete a franchise", async () => {
  const franchiseResponse = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [{ email: franchisee.email }] });

  const response = await request(app)
    .delete(`/api/franchise/${franchiseResponse.body.id}`)
    .set("Authorization", `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.message).toBe("franchise deleted");
});

function franchiseeRegisterId() {
  return testFranchise.admins.find((admin) => admin.email === franchisee.email)
    .id;
}
