const request = require("supertest");
const { randomName } = require("../helpers");
const app = require("../../src/service");
const { DB, Role } = require("../../src/database/database.js");

let adminToken;
let dinerToken;
let diner;
let franchise;
let store;
let menuItem;

beforeAll(async () => {
  await DB.initialized;

  const admin = {
    name: "order test admin",
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

  diner = {
    name: "order test diner",
    email: `${randomName()}@test.com`,
    password: "diner-password",
  };
  const dinerRegister = await request(app).post("/api/auth").send(diner);
  dinerToken = dinerRegister.body.token;

  franchise = await DB.createFranchise({ name: randomName(), admins: [] });
  store = await DB.createStore(franchise.id, { name: randomName() });
  menuItem = await DB.addMenuItem({
    title: randomName(),
    description: randomName(),
    image: "pizza.png",
    price: 10.99,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("get the pizza menu", async () => {
  const response = await request(app).get("/api/order/menu");

  expect(response.status).toBe(200);
  expect(response.body).toEqual(
    expect.arrayContaining([expect.objectContaining(menuItem)]),
  );
});

test("admin adds a menu item", async () => {
  const newMenuItem = {
    title: randomName(),
    description: "A new test pizza",
    image: "pizza-new.png",
    price: 12.5,
  };

  const response = await request(app)
    .put("/api/order/menu")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(newMenuItem);

  expect(response.status).toBe(200);
  expect(response.body).toEqual(
    expect.arrayContaining([expect.objectContaining(newMenuItem)]),
  );
});

test("reject non-admin menu updates", async () => {
  const response = await request(app)
    .put("/api/order/menu")
    .set("Authorization", `Bearer ${dinerToken}`)
    .send({
      title: randomName(),
      description: "not allowed",
      image: "x.png",
      price: 1,
    });

  expect(response.status).toBe(403);
  expect(response.body.message).toBe("unable to add menu item");
});

test("reject unauthenticated menu updates", async () => {
  const response = await request(app)
    .put("/api/order/menu")
    .send({
      title: randomName(),
      description: "not allowed",
      image: "x.png",
      price: 1,
    });

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("unauthorized");
});

test("get orders for the authenticated diner", async () => {
  const response = await request(app)
    .get("/api/order")
    .set("Authorization", `Bearer ${dinerToken}`);

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ orders: [], page: 1 });
  expect(response.body.dinerId).toEqual(expect.any(Number));
});

test("reject unauthenticated order lookup", async () => {
  const response = await request(app).get("/api/order");

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("unauthorized");
});

test("create an order and return the factory response", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      reportUrl: "https://factory.test/report",
      jwt: "factory-jwt",
    }),
  });

  const orderRequest = {
    franchiseId: franchise.id,
    storeId: store.id,
    items: [
      {
        menuId: menuItem.id,
        description: menuItem.title,
        price: menuItem.price,
      },
    ],
  };
  const response = await request(app)
    .post("/api/order")
    .set("Authorization", `Bearer ${dinerToken}`)
    .send(orderRequest);

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    order: { ...orderRequest, id: expect.any(Number) },
    followLinkToEndChaos: "https://factory.test/report",
    jwt: "factory-jwt",
  });
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/order"),
    expect.objectContaining({ method: "POST" }),
  );
});

test("return an error when the factory rejects an order", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: false,
    json: async () => ({ reportUrl: "https://factory.test/report" }),
  });

  const response = await request(app)
    .post("/api/order")
    .set("Authorization", `Bearer ${dinerToken}`)
    .send({
      franchiseId: franchise.id,
      storeId: store.id,
      items: [
        {
          menuId: menuItem.id,
          description: menuItem.title,
          price: menuItem.price,
        },
      ],
    });

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    message: "Failed to fulfill order at factory",
    followLinkToEndChaos: "https://factory.test/report",
  });
});

test("reject unauthenticated order creation", async () => {
  const response = await request(app).post("/api/order").send({
    franchiseId: franchise.id,
    storeId: store.id,
    items: [],
  });

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("unauthorized");
});
