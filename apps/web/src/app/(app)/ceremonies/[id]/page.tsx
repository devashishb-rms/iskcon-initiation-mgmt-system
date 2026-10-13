import { CeremonyDetailPage } from '@/features/ceremonies/CeremonyDetailPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CeremonyDetailPage id={id} />;
}
