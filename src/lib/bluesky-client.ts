/**
 * The poster's Bluesky adapter (reportsthatmatter-y2t.4): the `PosterClient` that src/lib/poster.ts decides with,
 * implemented with @atproto/api. Shared by the GitHub Actions poster (scripts/post-next.mjs, which reads card images
 * from disk) and the Cloudflare Worker poster (workers/poster/, which fetches them), so both read the account and
 * post in exactly the same way. Network only; no decisions here.
 */
import { AtpAgent } from "@atproto/api";
import { cardMeta, type FeedPost, type PosterClient, type PosterItem } from "./poster";

export type BlueskyConfig = {
  /** PDS base URL; default https://bsky.social. Tests point it at a local stand-in. */
  service?: string;
  /** Handle without "@", or the account DID. Also used in the post URLs written back. */
  handle: string;
  password: string;
  /** The PNG bytes of an item's card image (`item.card` is a repo-relative path). Throws if it is missing. */
  readCard(path: string): Promise<Uint8Array>;
  /** Called with the item just before anything is uploaded or posted; throw to refuse the post. */
  beforePublish?(item: PosterItem): Promise<void>;
};

export const postUrl = (handle: string, uri: string) => `https://bsky.app/profile/${handle}/post/${uri.split("/").pop()}`;

/** Logs in (an app password; bad credentials throw here, before anything is read or posted). */
export async function connectBluesky(config: BlueskyConfig): Promise<PosterClient> {
  const agent = new AtpAgent({ service: config.service || "https://bsky.social" });
  const handle = config.handle.trim().replace(/^@/, "");
  await agent.login({ identifier: handle, password: config.password.trim() });
  const did = agent.session!.did;

  const toFeedPost = (p: any): FeedPost => ({
    uri: p.uri,
    url: postUrl(handle, p.uri),
    text: p.record?.text ?? "",
    embedUri: p.embed?.external?.uri ?? null,
    createdAt: p.record?.createdAt ?? p.indexedAt ?? "",
  });

  return {
    async recentPosts() {
      const res = await agent.getAuthorFeed({ actor: did, limit: 100, filter: "posts_no_replies" });
      // Own posts only: a repost of someone else's post carries their author did.
      return res.data.feed.filter((f) => f.post.author.did === did && !f.reason).map((f) => toFeedPost(f.post));
    },
    async publish(item) {
      if (config.beforePublish) await config.beforePublish(item);
      const upload = await agent.uploadBlob(await config.readCard(item.card), { encoding: "image/png" });
      const { title, description } = cardMeta(item);
      const res = await agent.post({
        text: item.text,
        langs: ["en"],
        embed: {
          $type: "app.bsky.embed.external",
          external: { uri: item.link, title, description, thumb: upload.data.blob },
        },
      });
      return { uri: res.uri, url: postUrl(handle, res.uri), text: item.text, embedUri: item.link, createdAt: new Date().toISOString() };
    },
  };
}
