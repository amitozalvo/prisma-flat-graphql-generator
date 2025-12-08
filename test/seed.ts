import { PrismaClient } from "./generated/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  // use the same URL as in prisma.config.ts
  url: "file:./test.db",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  // Clean existing data
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  await prisma.internal.deleteMany();

  // Create test users
  const alice = await prisma.user.create({
    data: {
      email: "alice@example.com",
      name: "Alice",
      password: "secret123", // Will be excluded from GraphQL
      posts: {
        create: [
          {
            title: "Hello World",
            content: "This is my first post!",
            published: true,
          },
          {
            title: "GraphQL is Awesome",
            content: "Learning GraphQL with Prisma",
            published: true,
          },
        ],
      },
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: "bob@example.com",
      name: "Bob",
      password: "secret456",
      posts: {
        create: [
          {
            title: "Draft Post",
            content: "This is still a draft",
            published: false,
          },
        ],
      },
    },
  });

  // Create internal data (excluded from GraphQL)
  await prisma.internal.create({
    data: {
      data: "Internal system data",
    },
  });

  console.log("✅ Database seeded successfully!");
  console.log(`Created users: ${alice.name}, ${bob.name}`);
  console.log(`Total posts: ${await prisma.post.count()}`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
