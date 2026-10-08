export interface Env {
  UPDATES_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Capgo update check endpoint
    if (request.method === 'POST' && url.pathname === '/api/updates') {
      const body = await request.json() as { version?: string };
      const currentVersion = body.version;
      
      // Look up the latest version from R2 bucket metadata or a JSON index
      const latestInfo = await env.UPDATES_BUCKET.get('latest.json');
      if (!latestInfo) {
        return new Response('No updates found', { status: 404 });
      }
      
      const updateData = await latestInfo.json() as { version: string, url: string, checksum: string };
      if (updateData.version !== currentVersion) {
        return new Response(JSON.stringify({
          version: updateData.version,
          url: updateData.url,
          checksum: updateData.checksum
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response('Up to date', { status: 200 });
    }
    
    return new Response('Not found', { status: 404 });
  }
};
