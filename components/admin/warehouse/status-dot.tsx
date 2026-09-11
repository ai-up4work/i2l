export type QCItemStatus = "pending" | "passed" | "flagged";
export type PurchaseStatus = "pending" | "purchased" | "failed";
export type Status = QCItemStatus | PurchaseStatus;

export const statusColor: Record<Status, string> = {
  pending: "#8A7F6A",
  flagged: "#B4453A",
  passed: "#4B7B5A",
  purchased: "#4B7B5A",
  failed: "#B4453A",
};

export function StatusDot({ status }: { status: Status }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: 999,
        background: statusColor[status] ?? "#8A7F6A",
        marginRight: 7,
      }}
    />
  );
}