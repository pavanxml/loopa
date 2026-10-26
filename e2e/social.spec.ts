import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
const headers = { "X-Loopa-Request": "1" };
async function account(context: BrowserContext) {
  const username = `qa_${randomUUID().slice(0, 8)}`;
  const response = await context.request.post("/api/auth/signup", {
    headers,
    data: {
      username,
      email: `${username}@example.test`,
      password: "test-password-123",
      displayName: "Test Creator",
    },
  });
  expect(response.status()).toBe(201);
  return username;
}
async function image() {
  return sharp({
    create: { width: 960, height: 960, channels: 3, background: "#6e4de3" },
  })
    .jpeg()
    .toBuffer();
}
async function drop(
  context: BrowserContext,
  body: string,
  visibility = "public",
) {
  const response = await context.request.post("/api/posts", {
    headers,
    data: { type: "text", body, visibility },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data.id as string;
}
function assertNoErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return () => expect(errors).toEqual([]);
}

test("sign in, upload a photo drop, like, comment, save and reopen the share link", async ({
  page,
  context,
}) => {
  const check = assertNoErrors(page),
    username = await account(context);
  await context.request.post("/api/auth/logout", { headers });
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/create");
  await page
    .getByLabel("Post content")
    .fill("A real photo drop from the browser test.");
  await page
    .getByLabel("Attach photo or video")
    .setInputFiles({
      name: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: await image(),
    });
  await expect(
    page.getByRole("button", { name: "Post", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByText("A real photo drop from the browser test.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Like post", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unlike post", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save post", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unsave post", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Persist this comment.");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Comments", exact: true }),
  ).toContainText("Persist this comment.");
  const feed = await (await context.request.get("/api/feed")).json();
  const post = feed.data.items.find(
    (p: { body: string }) =>
      p.body === "A real photo drop from the browser test.",
  );
  await page.goto(`/post/${post.id}`);
  await expect(
    page.getByRole("button", { name: "Unlike post", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unsave post", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/drop-desktop.png",
    fullPage: true,
  });
  check();
});

test("private Orbit request and approval control feed visibility", async ({
  browser,
  context,
  page,
}) => {
  const owner = await account(context);
  await context.request.patch(`/api/users/${owner}`, {
    headers,
    data: { privacy: "private" },
  });
  const id = await drop(context, "Private Orbit drop");
  const outsider = await browser.newContext({
    baseURL: "http://localhost:3100",
  });
  try {
    const name = await account(outsider);
    expect((await outsider.request.get(`/api/posts/${id}`)).status()).toBe(404);
    const follow = await outsider.request.post(`/api/users/${owner}/follow`, {
      headers,
    });
    expect((await follow.json()).data.requested).toBe(true);
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Echoes" })).toBeVisible();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Accept", exact: true }),
    ).toHaveCount(0);
    expect((await outsider.request.get(`/api/posts/${id}`)).status()).toBe(200);
    await context.request.post("/api/safety", {
      headers,
      data: { action: "block", username: name },
    });
    expect((await outsider.request.get(`/api/posts/${id}`)).status()).toBe(404);
  } finally {
    await outsider.close();
  }
});

test("Whispers delivers live messages, replies and deletions between two browsers", async ({
  browser,
  context,
  page,
}) => {
  const check = assertNoErrors(page);
  await account(context);
  const other = await browser.newContext({ baseURL: "http://localhost:3100" });
  try {
    const username = await account(other);
    const response = await context.request.post("/api/conversations", {
      headers,
      data: { participantUsernames: [username] },
    });
    expect(response.status()).toBe(201);
    const id = (await response.json()).data.id;
    const second = await other.newPage();
    await second.goto(`/messages?conversation=${id}`);
    await page.goto(`/messages?conversation=${id}`);
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeVisible();
    await expect(
      second.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Hello from the first Orbit");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      second.getByText("Hello from the first Orbit", { exact: true }),
    ).toBeVisible();
    await second.getByRole("button", { name: "Reply", exact: true }).click();
    await second
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("A live reply");
    await second.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("A live reply", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(
      second.getByText("Message deleted", { exact: true }),
    ).toBeVisible();
    check();
  } finally {
    await other.close();
  }
});

test("mobile navigation, photo Sparks and Orbit grid render without overflow", async ({
  page,
  context,
}) => {
  const check = assertNoErrors(page);
  await account(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/moments");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "spark.jpg",
      mimeType: "image/jpeg",
      buffer: await image(),
    });
  await expect(
    page.getByRole("button", { name: "Share spark", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Story text")
    .or(page.getByLabel("Spark text"))
    .fill("Small spark, real upload.");
  await page.getByRole("button", { name: "Share spark", exact: true }).click();
  await expect(page.getByText("1 moments", { exact: true })).toBeVisible();
  await page.getByRole("button").filter({ hasText: "1 moments" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close spark" }).click();
  for (const path of [
    "/home",
    "/discover",
    "/reels",
    "/profile",
    "/saved",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/home");
  await expect(page.locator("article img").first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("article img")
        .first()
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/loop-mobile.png",
    fullPage: true,
  });
  check();
});

test("Flicks plays real uploaded video and protected media follows account privacy", async ({
  page,
  context,
  browser,
}) => {
  const username = await account(context),
    other = await browser.newContext({ baseURL: "http://localhost:3100" });
  try {
    const file = await readFile("e2e/fixtures/flick.mp4");
    const upload = await context.request.post("/api/uploads", {
      headers,
      multipart: {
        file: { name: "flick.mp4", mimeType: "video/mp4", buffer: file },
      },
    });
    expect(upload.status()).toBe(201);
    const media = (await upload.json()).data;
    expect((await other.request.get(media.url)).status()).toBe(404);
    const post = await context.request.post("/api/posts", {
      headers,
      data: {
        type: "video",
        body: "A real Flick",
        mediaUrls: [
          { url: media.url, kind: "video", thumbnailUrl: media.thumbnailUrl },
        ],
      },
    });
    expect(post.status()).toBe(201);
    const range = await other.request.get(media.url, {
      headers: { Range: "bytes=0-31" },
    });
    expect(range.status()).toBe(206);
    expect((await range.body()).length).toBe(32);
    expect(range.headers()["cache-control"]).toContain("no-store");
    await page.goto("/reels");
    const video = page.locator("video").first();
    await expect(video).toBeVisible();
    await expect
      .poll(() =>
        video.evaluate(
          (v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Like flick", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Like flick", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Save flick", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Save flick", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await context.request.patch(`/api/users/${username}`, {
      headers,
      data: { privacy: "private" },
    });
    expect((await other.request.get(media.url)).status()).toBe(404);
    expect((await context.request.get(media.url)).status()).toBe(200);
    await page.screenshot({
      path: "test-results/flicks-desktop.png",
      fullPage: true,
    });
  } finally {
    await other.close();
  }
});
