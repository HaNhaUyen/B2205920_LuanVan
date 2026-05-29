import { useState } from "react";
import { exportAdminSmartReport } from "@/lib/exportExcel";
import { useToast } from "@/components/ToastContext";

export default function AdminReportButton({
  type = "overview",
  filters = {},
  label = "Xuất Excel",
  className = "btn btn-light",
  size = "normal",
}) {
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await exportAdminSmartReport(type, filters);
      showToast?.(
        "Đã xuất báo cáo Excel gồm Summary + Insights + Data.",
        "success",
      );
    } catch (error) {
      showToast?.(error.message || "Không xuất được báo cáo.", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleExport}
      disabled={exporting}
      style={
        size === "sm"
          ? { padding: "8px 12px", fontSize: 13, whiteSpace: "nowrap" }
          : { whiteSpace: "nowrap" }
      }
    >
      {exporting ? "Đang xuất..." : label}
    </button>
  );
}
