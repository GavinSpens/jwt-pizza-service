const { DB, Role } = require("../../src/database/database.js");
const { randomName } = require("../helpers");

beforeAll(async () => {
  await DB.initialized;
});

function generateTestMenuItem() {
  return {
    title: randomName(),
    description: randomName(),
    image: randomName(),
    price: 10.99,
  };
}

function generateTestUser() {
  return {
    name: randomName(),
    email: randomName() + "@example.com",
    password: randomName(),
    roles: [{ role: Role.Diner }],
  };
}

function generateTestFranchiseeUser(franchiseName) {
  return {
    name: randomName(),
    email: randomName() + "@example.com",
    password: randomName(),
    roles: [{ role: Role.Franchisee, object: franchiseName }],
  };
}

function addMenuTestItem() {
  return DB.addMenuItem(generateTestMenuItem());
}

function addTestUser() {
  return DB.addUser(generateTestUser());
}

async function addTestFranchiseeUser() {
  const admin = await addTestUser();
  const franchise = await createTestFranchise([{ email: admin.email }]);
  return DB.addUser(generateTestFranchiseeUser(franchise.name));
}

function createTestFranchise(admins = []) {
  return DB.createFranchise({ name: randomName(), admins });
}

async function createOrderContext() {
  const user = await addTestUser();
  const franchise = await createTestFranchise();
  const store = await DB.createStore(franchise.id, { name: randomName() });
  const menuItem = await addMenuTestItem();
  return { user, franchise, store, menuItem };
}

function createTestOrder(user, franchise, store, items = []) {
  return DB.addDinerOrder(user, {
    franchiseId: franchise.id,
    storeId: store.id,
    items,
  });
}

describe("menu", () => {
  test("add menu item and get menu", async () => {
    const testMenuItem = await addMenuTestItem();
    const menu = await DB.getMenu();
    expect(menu).toEqual(
      expect.arrayContaining([expect.objectContaining(testMenuItem)]),
    );
  });
});

describe("users", () => {
  test("add and get user", async () => {
    const testUser = await addTestUser();
    const user = await DB.getUser(testUser.email);
    expect(testUser).toMatchObject({
      name: user.name,
      email: user.email,
      roles: [{ role: user.roles[0].role }],
    });
  });

  test("check whether a user exists", async () => {
    const testUser = await addTestUser();

    await expect(DB.userExists(testUser.email)).resolves.toBe(true);
    await expect(DB.userExists(randomName() + "@example.com")).resolves.toBe(
      false,
    );
  });

  test("reject unknown users and incorrect passwords", async () => {
    const testUser = generateTestUser();
    await DB.addUser(testUser);

    await expect(
      DB.getUser(randomName() + "@example.com"),
    ).rejects.toMatchObject({ message: "unknown user", statusCode: 404 });
    await expect(
      DB.getUser(testUser.email, "incorrect-password"),
    ).rejects.toMatchObject({ message: "unknown user", statusCode: 404 });
    await expect(
      DB.getUser(testUser.email, testUser.password),
    ).resolves.toMatchObject({ email: testUser.email });
  });

  test("add and get franchisee user", async () => {
    const testUser = await addTestFranchiseeUser();
    const user = await DB.getUser(testUser.email);
    expect(testUser).toMatchObject({
      name: user.name,
      email: user.email,
      roles: [{ role: user.roles[0].role }],
    });
  });

  test("update user", async () => {
    const testUser = await addTestUser();
    const updatedName = randomName();
    const updatedEmail = randomName() + "@example.com";
    const user = await DB.getUser(testUser.email);
    await DB.updateUser(user.id, updatedName, updatedEmail);
    const updatedUser = await DB.getUser(updatedEmail);
    expect(updatedUser).toMatchObject({
      name: updatedName,
      email: updatedEmail,
    });
  });

  test("update user fields without changing email", async () => {
    const testUser = await addTestUser();
    const user = await DB.getUser(testUser.email);
    const updatedName = randomName();

    const updatedUser = await DB.updateUser(user.id, updatedName);

    expect(updatedUser).toMatchObject({
      id: user.id,
      name: updatedName,
      email: testUser.email,
    });
  });

  test("update user password and preserve it as a hash", async () => {
    const testUser = generateTestUser();
    const originalPassword = testUser.password;
    await DB.addUser(testUser);
    const user = await DB.getUser(testUser.email);
    const updatedPassword = randomName();

    const updatedUser = await DB.updateUser(
      user.id,
      "O'Connor",
      undefined,
      updatedPassword,
    );

    expect(updatedUser).toMatchObject({
      name: "O'Connor",
      email: testUser.email,
    });
    await expect(
      DB.getUser(testUser.email, updatedPassword),
    ).resolves.toMatchObject({ id: user.id });
    await expect(
      DB.getUser(testUser.email, originalPassword),
    ).rejects.toMatchObject({ message: "unknown user", statusCode: 404 });
  });
});

describe("authentication", () => {
  test("store and remove the JWT signature for login state", async () => {
    const testUser = await addTestUser();
    const token = "header.payload." + randomName();

    await expect(DB.isLoggedIn(token)).resolves.toBe(false);
    await DB.loginUser(testUser.id, token);
    await expect(DB.isLoggedIn(token)).resolves.toBe(true);
    await DB.logoutUser(token);
    await expect(DB.isLoggedIn(token)).resolves.toBe(false);
  });
});

describe("orders", () => {
  test("get orders", async () => {
    const testUser = await addTestUser();
    const user = await DB.getUser(testUser.email);
    const res = await DB.getOrders(user);
    expect(res.orders).toEqual([]);
  });

  test("create an order and return its items when listing orders", async () => {
    const { user, franchise, store, menuItem } = await createOrderContext();
    const items = [
      {
        menuId: menuItem.id,
        description: menuItem.title,
        price: menuItem.price,
      },
    ];

    const createdOrder = await createTestOrder(user, franchise, store, items);
    const result = await DB.getOrders(user);

    expect(createdOrder).toMatchObject({
      franchiseId: franchise.id,
      storeId: store.id,
      items,
      id: expect.any(Number),
    });
    expect(result).toMatchObject({ dinerId: user.id, page: 1 });
    expect(result.orders).toEqual([
      expect.objectContaining({
        id: createdOrder.id,
        franchiseId: franchise.id,
        storeId: store.id,
        items: [
          expect.objectContaining({
            menuId: menuItem.id,
            description: menuItem.title,
            price: menuItem.price,
          }),
        ],
      }),
    ]);
  });

  test("paginate diner orders", async () => {
    const { user, franchise, store } = await createOrderContext();
    for (let index = 0; index < 11; index += 1) {
      await createTestOrder(user, franchise, store);
    }

    const firstPage = await DB.getOrders(user, 1);
    const secondPage = await DB.getOrders(user, 2);

    expect(firstPage.orders).toHaveLength(10);
    expect(secondPage.orders).toHaveLength(1);
    expect(secondPage.page).toBe(2);
  });
});

describe("franchises and stores", () => {
  test("create a franchise with admins and list the user's franchises", async () => {
    const admin = await addTestUser();
    const franchise = await createTestFranchise([{ email: admin.email }]);
    const user = await DB.getUser(admin.email);

    expect(franchise.admins[0]).toMatchObject({
      id: user.id,
      name: user.name,
      email: user.email,
    });
    await expect(DB.getUserFranchises(user.id)).resolves.toEqual([
      expect.objectContaining({
        id: franchise.id,
        name: franchise.name,
        admins: [expect.objectContaining({ id: user.id, email: user.email })],
        stores: [],
      }),
    ]);
  });

  test("reject franchise creation when an admin does not exist", async () => {
    await expect(
      createTestFranchise([{ email: randomName() + "@example.com" }]),
    ).rejects.toMatchObject({
      message: expect.stringContaining("unknown user for franchise admin"),
      statusCode: 404,
    });
  });

  test("list franchises with name filtering and pagination", async () => {
    const prefix = "db-test-" + randomName();
    const first = await DB.createFranchise({
      name: prefix + "-first",
      admins: [],
    });
    const second = await DB.createFranchise({
      name: prefix + "-second",
      admins: [],
    });

    const [page, more] = await DB.getFranchises(null, 0, 1, prefix + "*");
    const [nextPage, nextMore] = await DB.getFranchises(
      null,
      1,
      1,
      prefix + "*",
    );

    expect(page).toHaveLength(1);
    expect(more).toBe(true);
    expect(nextPage).toHaveLength(1);
    expect(nextMore).toBe(false);
    expect([first.name, second.name]).toContain(page[0].name);
    expect([first.name, second.name]).toContain(nextPage[0].name);
    expect(page[0].stores).toEqual([]);
  });

  test("include store revenue for admins and basic store data for public listings", async () => {
    const admin = await addTestUser();
    const franchise = await createTestFranchise([{ email: admin.email }]);
    const store = await DB.createStore(franchise.id, { name: randomName() });
    const diner = await addTestUser();
    const menuItem = await addMenuTestItem();
    await createTestOrder(diner, franchise, store, [
      {
        menuId: menuItem.id,
        description: menuItem.title,
        price: menuItem.price,
      },
    ]);
    const adminUser = await DB.getUser(admin.email);

    const [adminFranchises] = await DB.getFranchises(
      { isRole: (role) => role === Role.Admin },
      0,
      10,
      franchise.name,
    );
    const [publicFranchises] = await DB.getFranchises(
      null,
      0,
      10,
      franchise.name,
    );
    const detailedFranchise = await DB.getFranchise({ id: franchise.id });

    expect(adminUser.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: Role.Franchisee }),
      ]),
    );
    expect(adminFranchises[0].stores[0]).toMatchObject({
      id: store.id,
      totalRevenue: menuItem.price,
    });
    expect(publicFranchises[0].stores).toEqual([
      expect.objectContaining({ id: store.id, name: store.name }),
    ]);
    expect(detailedFranchise.admins).toEqual([
      expect.objectContaining({ id: adminUser.id, email: admin.email }),
    ]);
  });

  test("create and delete a store within its franchise", async () => {
    const franchise = await createTestFranchise();
    const store = await DB.createStore(franchise.id, { name: randomName() });
    const otherFranchise = await createTestFranchise();
    const otherStore = await DB.createStore(otherFranchise.id, {
      name: randomName(),
    });

    await DB.deleteStore(franchise.id, store.id);

    await expect(DB.getFranchise({ id: franchise.id })).resolves.toMatchObject({
      stores: [],
    });
    await expect(
      DB.getFranchise({ id: otherFranchise.id }),
    ).resolves.toMatchObject({
      stores: [expect.objectContaining({ id: otherStore.id })],
    });
  });

  test("delete a franchise and its franchisee roles and stores", async () => {
    const admin = await addTestUser();
    const franchise = await createTestFranchise([{ email: admin.email }]);
    await DB.createStore(franchise.id, { name: randomName() });

    await DB.deleteFranchise(franchise.id);

    const [franchises] = await DB.getFranchises(null, 0, 10, franchise.name);
    const updatedAdmin = await DB.getUser(admin.email);
    expect(franchises).toEqual([]);
    expect(updatedAdmin.roles).toEqual([
      expect.objectContaining({ role: Role.Diner }),
    ]);
  });
});

describe("database helpers", () => {
  test("calculate order offsets and extract JWT signatures", () => {
    expect(DB.getOffset(1, 10)).toBe(0);
    expect(DB.getOffset(3, 10)).toBe(20);
    expect(DB.getTokenSignature("header.payload.signature")).toBe("signature");
    expect(DB.getTokenSignature("not-a-jwt")).toBe("");
  });
});
