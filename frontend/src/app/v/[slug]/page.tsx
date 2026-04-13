import type { Metadata } from 'next';
import { API_BASE_URL } from '@/utils/apiConfig';

type LinkCastData = {
  slug: string;
  imageUrl: string;
  targetUrl: string;
};

function normalizeBaseUrl(raw: string): string {
  const withProtocol = raw.startsWith('http') ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, '').replace(/\/api$/, '');
}

async function getLinkCast(slug: string): Promise<LinkCastData | null> {
  const hardcodedBackendFallback = 'https://faithful-surprise-production-3d52.up.railway.app';
  const candidates = [
    process.env.BACKEND_PUBLIC_URL,
    process.env.NEXT_PUBLIC_API_URL,
    API_BASE_URL,
    hardcodedBackendFallback,
    process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : undefined
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeBaseUrl);

  try {
    for (const baseUrl of candidates) {
      const endpoint = `${baseUrl}/api/link-cast/${slug}`;
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (res.ok) return res.json();
        console.error(`[link-cast] ${res.status} on ${endpoint}`);
      } catch (error) {
        console.error(`[link-cast] fetch failed on ${endpoint}`, error);
      }
    }
  } catch (error) {
    console.error('[link-cast] unexpected error', error);
  }
  return null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const linkCast = await getLinkCast(params.slug);
  const image = linkCast?.imageUrl || '';
  return {
    title: 'Click to view',
    description: 'Click to view',
    openGraph: {
      title: 'Click to view',
      images: image ? [{ url: image }] : []
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Click to view',
      images: image ? [image] : []
    }
  };
}

export default async function LinkCastPreviewPage({ params }: { params: { slug: string } }) {
  const linkCast = await getLinkCast(params.slug);

  if (!linkCast) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Lien introuvable
      </div>
    );
  }

  const safeTarget = linkCast.targetUrl.replace(/"/g, '%22');

  return (
    <div style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <img
        src={linkCast.imageUrl}
        alt="preview"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){ window.location.href = "${safeTarget}"; }, 500);`
        }}
      />
    </div>
  );
}
