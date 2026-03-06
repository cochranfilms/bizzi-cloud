import TransferView from "@/components/transfer/TransferView";

export default async function TransferPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TransferView slug={slug} />;
}
