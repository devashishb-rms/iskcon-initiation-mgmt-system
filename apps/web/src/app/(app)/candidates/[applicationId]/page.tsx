import { ApplicationFilePage } from '@/features/application/ApplicationFilePage';

export default async function Page({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return <ApplicationFilePage applicationId={applicationId} />;
}
