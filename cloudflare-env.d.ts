declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    YOUTUBE_API_KEY?: string;
    SPOTIFY_CLIENT_ID?: string;
  }
}
