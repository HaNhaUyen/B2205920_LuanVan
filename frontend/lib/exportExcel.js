import { apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { mapLabel } from "@/lib/labels";

const STATUS_ICONS = {
  success: "🟢",
  warning: "🟡",
  danger: "🔴",
  neutral: "⚪",
  info: "🔵",
};

function cleanValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function ensureRows(rows = [], emptyMessage = "Không có dữ liệu") {
  return rows.length ? rows : [{ "Thông báo": emptyMessage }];
}

function autoFitColumns(rows) {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  return keys.map((key) => {
    const maxLength = rows.reduce((max, row) => {
      const value = String(cleanValue(row[key]));
      return Math.max(max, value.length);
    }, key.length);
    return { wch: Math.min(Math.max(maxLength + 3, 14), 48) };
  });
}

function createBar(value, max) {
  if (!value || !max) return "";
  const width = Math.max(2, Math.round((Number(value) / Number(max)) * 18));
  return "█".repeat(Math.min(width, 18));
}

function formatPercent(value, total) {
  if (!total) return "0%";
  return `${((Number(value) / Number(total)) * 100).toFixed(1)}%`;
}

function buildStatusCell(value, tone = "neutral") {
  return `${STATUS_ICONS[tone] || STATUS_ICONS.neutral} ${value}`;
}

function toneFromKeyword(value = "") {
  const text = String(value).toLowerCase();
  if (
    [
      "đã gửi",
      "đã thanh toán",
      "đã xác nhận",
      "đang bán",
      "đã duyệt",
      "đã xử lý",
      "hoàn tất",
      "active",
      "published",
      "approved",
      "resolved",
      "sent",
      "paid",
      "confirmed",
    ].some((item) => text.includes(item))
  )
    return "success";
  if (
    [
      "chờ",
      "mới",
      "nháp",
      "đang xử lý",
      "waiting",
      "pending",
      "processing",
      "draft",
    ].some((item) => text.includes(item))
  )
    return "warning";
  if (
    [
      "lỗi",
      "thất bại",
      "đã hủy",
      "hết hạn",
      "ẩn",
      "ngừng",
      "failed",
      "cancelled",
      "expired",
      "inactive",
      "rejected",
      "refunded",
    ].some((item) => text.includes(item))
  )
    return "danger";
  return "neutral";
}

function setCellStyle(worksheet, ref, style) {
  if (!worksheet[ref]) return;
  worksheet[ref].s = { ...(worksheet[ref].s || {}), ...style };
}

function styleRange(worksheet, XLSX, rangeRef, style) {
  const range = XLSX.utils.decode_range(rangeRef);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      setCellStyle(
        worksheet,
        XLSX.utils.encode_cell({ r: row, c: col }),
        style,
      );
    }
  }
}

function decorateSheet(XLSX, worksheet, rowCount, colCount, options = {}) {
  const lastColLetter = XLSX.utils.encode_col(Math.max(colCount - 1, 0));
  if (options.title) {
    worksheet["!merges"] = [
      ...(worksheet["!merges"] || []),
      XLSX.utils.decode_range(`A1:${lastColLetter}1`),
    ];
    setCellStyle(worksheet, "A1", {
      font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "1F4E78" } },
      alignment: { horizontal: "center", vertical: "center" },
    });
  }

  const headerRowIndex = options.headerRowIndex ?? 0;
  styleRange(
    worksheet,
    XLSX,
    `A${headerRowIndex + 1}:${lastColLetter}${headerRowIndex + 1}`,
    {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "305496" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    },
  );

  if (rowCount > headerRowIndex + 1) {
    for (let row = headerRowIndex + 2; row <= rowCount; row += 1) {
      const color = row % 2 === 0 ? "F7FBFF" : "FFFFFF";
      styleRange(worksheet, XLSX, `A${row}:${lastColLetter}${row}`, {
        fill: { patternType: "solid", fgColor: { rgb: color } },
        alignment: { vertical: "top", wrapText: true },
      });
    }
  }

  (options.statusColumns || []).forEach((columnName) => {
    const headerRowNumber = headerRowIndex + 1;
    const headers = [];
    for (let col = 0; col < colCount; col += 1) {
      const ref = XLSX.utils.encode_cell({ r: headerRowIndex, c: col });
      headers.push(String(worksheet[ref]?.v || ""));
    }
    const targetIndex = headers.findIndex((item) => item === columnName);
    if (targetIndex < 0) return;
    for (let row = headerRowNumber + 1; row <= rowCount; row += 1) {
      const ref = XLSX.utils.encode_cell({ r: row - 1, c: targetIndex });
      const tone = toneFromKeyword(worksheet[ref]?.v || "");
      const palette = {
        success: {
          font: { color: { rgb: "0F5132" }, bold: true },
          fill: { patternType: "solid", fgColor: { rgb: "D1E7DD" } },
        },
        warning: {
          font: { color: { rgb: "664D03" }, bold: true },
          fill: { patternType: "solid", fgColor: { rgb: "FFF3CD" } },
        },
        danger: {
          font: { color: { rgb: "842029" }, bold: true },
          fill: { patternType: "solid", fgColor: { rgb: "F8D7DA" } },
        },
        neutral: {
          font: { color: { rgb: "495057" }, bold: true },
          fill: { patternType: "solid", fgColor: { rgb: "E9ECEF" } },
        },
      };
      setCellStyle(worksheet, ref, palette[tone] || palette.neutral);
    }
  });
}

function appendJsonSheet(XLSX, workbook, sheetName, rows, options = {}) {
  const safeRows = ensureRows(rows).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, cleanValue(value)]),
    ),
  );
  const worksheet = XLSX.utils.json_to_sheet(safeRows, {
    origin: options.origin || "A1",
  });
  worksheet["!cols"] = autoFitColumns(safeRows);
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
  if (range.e.c >= range.s.c && range.e.r >= range.s.r) {
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: options.headerRowIndex ?? 0, c: 0 },
        e: { r: range.e.r, c: range.e.c },
      }),
    };
  }
  decorateSheet(XLSX, worksheet, range.e.r + 1, range.e.c + 1, {
    headerRowIndex: options.headerRowIndex ?? 0,
    title: options.title,
    statusColumns: options.statusColumns || [],
  });
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
}

function appendDashboardSheet(XLSX, workbook, config) {
  const metrics = config.metrics || [];
  const charts = config.charts || [];
  const legend = config.legend || [];
  const maxChartValue = Math.max(
    0,
    ...charts.flatMap((group) =>
      group.rows.map((row) => Number(row.value || 0)),
    ),
  );

  const aoa = [
    [config.title || "Báo cáo tổng hợp"],
    [],
    ["Thời gian xuất", formatDateTime(new Date())],
    [],
    ["Chỉ số tổng quan", "Giá trị"],
    ...metrics.map((item) => [item.label, cleanValue(item.value)]),
  ];

  charts.forEach((group) => {
    aoa.push([]);
    aoa.push([group.title, "Số lượng", "Tỷ lệ", "Biểu đồ"]);
    group.rows.forEach((row) => {
      aoa.push([
        row.label,
        Number(row.value || 0),
        formatPercent(row.value || 0, group.total || 0),
        createBar(row.value || 0, maxChartValue || group.total || 0),
      ]);
    });
  });

  if (legend.length) {
    aoa.push([]);
    aoa.push(["Chú thích trạng thái", "Ý nghĩa"]);
    legend.forEach((item) => aoa.push([item.label, item.value]));
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const maxCols = Math.max(...aoa.map((row) => row.length), 1);
  worksheet["!cols"] = [
    { wch: 28 },
    { wch: 18 },
    { wch: 14 },
    { wch: 26 },
  ].slice(0, Math.max(maxCols, 4));
  worksheet["!merges"] = [XLSX.utils.decode_range(`A1:D1`)];
  setCellStyle(worksheet, "A1", {
    font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "1F4E78" } },
    alignment: { horizontal: "center", vertical: "center" },
  });

  const sectionHeaders = [];
  aoa.forEach((row, index) => {
    if (!row.length) return;
    if (
      ["Chỉ số tổng quan", "Chú thích trạng thái"].includes(row[0]) ||
      charts.some((group) => group.title === row[0])
    ) {
      sectionHeaders.push(index + 1);
    }
  });

  sectionHeaders.forEach((rowNumber) => {
    styleRange(worksheet, XLSX, `A${rowNumber}:D${rowNumber}`, {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "5B9BD5" } },
      alignment: { horizontal: "center", vertical: "center" },
    });
  });

  for (let row = 2; row <= aoa.length; row += 1) {
    if (sectionHeaders.includes(row)) continue;
    styleRange(worksheet, XLSX, `A${row}:D${row}`, {
      alignment: { vertical: "top", wrapText: true },
    });
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Dashboard");
}

async function exportWorkbook(filename, config) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: config.title || filename,
    Author: "Travela Admin",
    Company: "Travela",
    CreatedDate: new Date(),
  };

  appendDashboardSheet(XLSX, workbook, config);
  (config.sheets || []).forEach((sheet) => {
    appendJsonSheet(XLSX, workbook, sheet.name, sheet.rows, {
      statusColumns: sheet.statusColumns || [],
      headerRowIndex: 0,
    });
  });
  XLSX.writeFile(
    workbook,
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
}

async function fetchAllPages(path, filters = {}) {
  const initialFilters = { ...filters, page: 1, pageSize: 100 };
  const initialQuery = new URLSearchParams();
  Object.entries(initialFilters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      initialQuery.set(key, String(value));
  });
  const firstPage = await apiFetch(`${path}?${initialQuery.toString()}`);
  const items = [...(firstPage?.items || [])];
  const totalPages = Number(firstPage?.pagination?.totalPages || 1);
  for (let page = 2; page <= totalPages; page += 1) {
    const nextQuery = new URLSearchParams(initialQuery);
    nextQuery.set("page", String(page));
    const nextPage = await apiFetch(`${path}?${nextQuery.toString()}`);
    items.push(...(nextPage?.items || []));
  }
  return items;
}

function countBy(items = [], selector) {
  return items.reduce((acc, item) => {
    const key = selector(item) || "Khác";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countsToChartRows(counts = {}, labelMapper = (value) => value) {
  return Object.entries(counts).map(([key, value]) => ({
    label: labelMapper(key),
    value,
  }));
}

function buildBookingsRows(items = []) {
  return items.map((item) => {
    const payment = item.payments?.[0];
    return {
      "Mã booking": item.bookingCode,
      "Khách hàng": item.contactName,
      Email: item.contactEmail,
      "Số điện thoại": item.contactPhone,
      Tour: item.tour?.name || "",
      "Người lớn": item.adultCount,
      "Trẻ em": item.childCount,
      "Trạng thái booking": buildStatusCell(
        mapLabel("bookingStatus", item.bookingStatus),
        toneFromKeyword(mapLabel("bookingStatus", item.bookingStatus)),
      ),
      "Phương thức thanh toán": payment
        ? mapLabel("paymentMethod", payment.paymentMethod)
        : "",
      "Trạng thái thanh toán": payment
        ? buildStatusCell(
            mapLabel("paymentStatus", payment.paymentStatus),
            toneFromKeyword(mapLabel("paymentStatus", payment.paymentStatus)),
          )
        : "",
      "Tổng tiền": Number(item.finalAmount || 0),
      "Tổng tiền hiển thị": formatCurrency(item.finalAmount || 0),
      "Ngày tạo": formatDateTime(item.createdAt),
    };
  });
}

function contactEmailDisplay(item) {
  if (item.replyEmailSentAt)
    return buildStatusCell(
      `Đã gửi ${formatDateTime(item.replyEmailSentAt)}`,
      "success",
    );
  if (item.replyEmailError) return buildStatusCell("Gửi lỗi", "danger");
  return buildStatusCell("Chưa gửi", "neutral");
}

function buildContactsRows(items = []) {
  return items.map((item) => ({
    "Mã liên hệ": item.id,
    "Khách hàng": item.fullName,
    Email: item.email,
    "Số điện thoại": item.phone || "",
    "Chủ đề": item.subject,
    "Nội dung": item.message,
    "Phản hồi admin": item.adminReply || "",
    "Người xử lý": item.handler?.fullName || "",
    "Trạng thái": buildStatusCell(
      mapLabel("contactStatus", item.status),
      toneFromKeyword(mapLabel("contactStatus", item.status)),
    ),
    "Email phản hồi": contactEmailDisplay(item),
    "Thời gian gửi email": item.replyEmailSentAt
      ? formatDateTime(item.replyEmailSentAt)
      : "",
    "Lỗi email": item.replyEmailError || "",
    "Ngày tạo": formatDateTime(item.createdAt),
  }));
}

function buildContactEmailLogRows(items = []) {
  return items.map((item) => ({
    "Mã log": item.id,
    "Mã liên hệ": item.contact?.id || item.contactId || "",
    "Khách hàng": item.contact?.fullName || "",
    Email: item.recipientEmail,
    "Chủ đề email": item.subject,
    "Nội dung tóm tắt": item.bodyPreview || "",
    "Trạng thái gửi": buildStatusCell(
      item.sendStatus === "sent" ? "Đã gửi" : "Gửi lỗi",
      item.sendStatus === "sent" ? "success" : "danger",
    ),
    "Thời gian thử gửi": formatDateTime(item.attemptedAt),
    "Thời gian gửi thành công": item.sentAt ? formatDateTime(item.sentAt) : "",
    "Người gửi": item.adminUser?.fullName || "",
    Lỗi: item.errorMessage || "",
    "Trạng thái liên hệ": item.contact?.status
      ? buildStatusCell(
          mapLabel("contactStatus", item.contact.status),
          toneFromKeyword(mapLabel("contactStatus", item.contact.status)),
        )
      : "",
    "Chủ đề liên hệ": item.contact?.subject || "",
  }));
}

function buildReviewsRows(items = []) {
  return items.map((item) => ({
    Tour: item.tour?.name || "",
    "Khách hàng": item.user?.fullName || "Khách vãng lai",
    Email: item.user?.email || "",
    Điểm: item.rating,
    "Nội dung": item.comment || "",
    "Trạng thái": buildStatusCell(
      mapLabel("reviewStatus", item.status),
      toneFromKeyword(mapLabel("reviewStatus", item.status)),
    ),
    "Ngày tạo": formatDateTime(item.createdAt),
  }));
}

function buildFaqRows(items = []) {
  return items.map((item) => ({
    "Câu hỏi": item.question,
    "Câu trả lời": item.answer,
    "Chủ đề": mapLabel("faqTopic", item.topic),
    "Trạng thái": buildStatusCell(
      item.status === "active" ? "Đang hiển thị" : "Đang ẩn",
      item.status === "active" ? "success" : "danger",
    ),
    "Thứ tự": item.displayOrder,
    "Ngày tạo": formatDateTime(item.createdAt),
  }));
}

function buildToursRows(items = []) {
  return items.map((item) => ({
    "Mã tour": item.code,
    "Tên tour": item.name,
    "Điểm đến": item.destination?.name || "",
    "Loại tour": mapLabel("tourType", item.tourType),
    "Chủ đề": mapLabel("tourTheme", item.tourTheme),
    "Số ngày": item.durationDays,
    "Số đêm": item.durationNights,
    "Giá người lớn": Number(item.basePriceAdult || 0),
    "Giá trẻ em": Number(item.basePriceChild || 0),
    "Trạng thái": buildStatusCell(
      mapLabel("tourStatus", item.status),
      toneFromKeyword(mapLabel("tourStatus", item.status)),
    ),
    "Khách sạn": item.hotelStars ? `${item.hotelStars} sao` : "",
    "Ngày tạo": formatDateTime(item.createdAt),
  }));
}

function buildUsersRows(items = []) {
  return items.map((item) => ({
    "Họ tên": item.fullName,
    Email: item.email,
    "Số điện thoại": item.phone || "",
    "Vai trò": buildStatusCell(
      mapLabel("role", item.role),
      item.role === "admin" ? "info" : "neutral",
    ),
    "Trạng thái": buildStatusCell(item.status, toneFromKeyword(item.status)),
    "Nhà cung cấp": item.authProvider || "",
    "Số booking": item._count?.bookings || 0,
    "Số review": item._count?.reviews || 0,
    "Số liên hệ": item._count?.contacts || 0,
    "Ngày tạo": formatDate(item.createdAt),
  }));
}

function legendRowsForStatuses(items = []) {
  return items.map((item) => ({ label: item.label, value: item.value }));
}

export async function exportAdminBookings(filters = {}) {
  const items = await fetchAllPages("/admin/bookings", filters);
  const paidTotal = items.reduce(
    (sum, item) => sum + Number(item.finalAmount || 0),
    0,
  );
  const bookingCounts = countBy(items, (item) => item.bookingStatus);
  const paymentCounts = countBy(
    items,
    (item) => item.payments?.[0]?.paymentStatus || "pending",
  );
  return exportWorkbook(
    `travela-bookings-${new Date().toISOString().slice(0, 10)}.xlsx`,
    {
      title: "Báo cáo booking Travela",
      metrics: [
        { label: "Tổng số booking", value: items.length },
        { label: "Tổng doanh thu", value: formatCurrency(paidTotal) },
      ],
      charts: [
        {
          title: "Biểu đồ trạng thái booking",
          total: items.length,
          rows: countsToChartRows(bookingCounts, (value) =>
            mapLabel("bookingStatus", value),
          ),
        },
        {
          title: "Biểu đồ trạng thái thanh toán",
          total: items.length,
          rows: countsToChartRows(paymentCounts, (value) =>
            mapLabel("paymentStatus", value),
          ),
        },
      ],
      legend: legendRowsForStatuses([
        { label: "🟢", value: "Đã xác nhận / đã thanh toán / hoàn tất" },
        { label: "🟡", value: "Đang chờ xử lý" },
        { label: "🔴", value: "Hủy / hết hạn / thất bại" },
      ]),
      sheets: [
        {
          name: "TrangThaiBooking",
          rows: countsToChartRows(bookingCounts, (value) =>
            mapLabel("bookingStatus", value),
          ).map((row) => ({
            "Trạng thái booking": row.label,
            "Số lượng": row.value,
          })),
        },
        {
          name: "TrangThaiThanhToan",
          rows: countsToChartRows(paymentCounts, (value) =>
            mapLabel("paymentStatus", value),
          ).map((row) => ({
            "Trạng thái thanh toán": row.label,
            "Số lượng": row.value,
          })),
        },
        {
          name: "DuLieu",
          rows: buildBookingsRows(items),
          statusColumns: ["Trạng thái booking", "Trạng thái thanh toán"],
        },
      ],
    },
  );
}

export async function exportAdminContacts(filters = {}) {
  const [items, emailLogs] = await Promise.all([
    fetchAllPages("/admin/contacts", filters),
    fetchAllPages("/admin/contact-email-logs", filters),
  ]);
  const sentCount = items.filter((item) => item.replyEmailSentAt).length;
  const failedCount = items.filter(
    (item) => !item.replyEmailSentAt && item.replyEmailError,
  ).length;
  const pendingCount = items.filter(
    (item) => !item.replyEmailSentAt && !item.replyEmailError,
  ).length;
  const contactCounts = countBy(items, (item) => item.status);
  const emailCounts = {
    sent: sentCount,
    failed: failedCount,
    pending: pendingCount,
  };
  return exportWorkbook(
    `travela-contacts-${new Date().toISOString().slice(0, 10)}.xlsx`,
    {
      title: "Báo cáo liên hệ Travela",
      metrics: [
        { label: "Tổng số liên hệ", value: items.length },
        { label: "Đã gửi mail", value: sentCount },
        { label: "Gửi lỗi", value: failedCount },
        { label: "Chưa gửi", value: pendingCount },
      ],
      charts: [
        {
          title: "Biểu đồ trạng thái liên hệ",
          total: items.length,
          rows: countsToChartRows(contactCounts, (value) =>
            mapLabel("contactStatus", value),
          ),
        },
        {
          title: "Biểu đồ trạng thái email",
          total: items.length,
          rows: countsToChartRows(
            emailCounts,
            (value) =>
              ({ sent: "Đã gửi mail", failed: "Gửi lỗi", pending: "Chưa gửi" })[
                value
              ] || value,
          ),
        },
      ],
      legend: legendRowsForStatuses([
        { label: "🟢", value: "Đã gửi mail hoặc đã xử lý xong" },
        { label: "🟡", value: "Mới / đang chờ / chưa gửi mail" },
        { label: "🔴", value: "Gửi mail lỗi" },
      ]),
      sheets: [
        {
          name: "TrangThaiLienHe",
          rows: countsToChartRows(contactCounts, (value) =>
            mapLabel("contactStatus", value),
          ).map((row) => ({
            "Trạng thái liên hệ": row.label,
            "Số lượng": row.value,
          })),
        },
        {
          name: "TrangThaiEmail",
          rows: countsToChartRows(
            emailCounts,
            (value) =>
              ({ sent: "Đã gửi mail", failed: "Gửi lỗi", pending: "Chưa gửi" })[
                value
              ] || value,
          ).map((row) => ({
            "Trạng thái email": row.label,
            "Số lượng": row.value,
          })),
        },
        {
          name: "DanhSachLienHe",
          rows: buildContactsRows(items),
          statusColumns: ["Trạng thái", "Email phản hồi"],
        },
        {
          name: "LichSuEmail",
          rows: buildContactEmailLogRows(emailLogs),
          statusColumns: ["Trạng thái gửi", "Trạng thái liên hệ"],
        },
      ],
    },
  );
}

export async function exportAdminReviews(filters = {}) {
  const items = await fetchAllPages("/admin/reviews", filters);
  const reviewCounts = countBy(items, (item) => item.status);
  return exportWorkbook(
    `travela-reviews-${new Date().toISOString().slice(0, 10)}.xlsx`,
    {
      title: "Báo cáo đánh giá Travela",
      metrics: [{ label: "Tổng số đánh giá", value: items.length }],
      charts: [
        {
          title: "Biểu đồ trạng thái review",
          total: items.length,
          rows: countsToChartRows(reviewCounts, (value) =>
            mapLabel("reviewStatus", value),
          ),
        },
      ],
      legend: legendRowsForStatuses([
        { label: "🟢", value: "Đã duyệt" },
        { label: "🟡", value: "Chờ duyệt" },
        { label: "🔴", value: "Ẩn / từ chối" },
      ]),
      sheets: [
        {
          name: "TrangThaiReview",
          rows: countsToChartRows(reviewCounts, (value) =>
            mapLabel("reviewStatus", value),
          ).map((row) => ({
            "Trạng thái review": row.label,
            "Số lượng": row.value,
          })),
        },
        {
          name: "DuLieu",
          rows: buildReviewsRows(items),
          statusColumns: ["Trạng thái"],
        },
      ],
    },
  );
}

export async function exportAdminFaqs(filters = {}) {
  const items = await fetchAllPages("/admin/faqs", filters);
  const faqCounts = countBy(items, (item) => item.status);
  return exportWorkbook(
    `travela-faqs-${new Date().toISOString().slice(0, 10)}.xlsx`,
    {
      title: "Báo cáo FAQ Travela",
      metrics: [{ label: "Tổng số FAQ", value: items.length }],
      charts: [
        {
          title: "Biểu đồ trạng thái FAQ",
          total: items.length,
          rows: countsToChartRows(faqCounts, (value) =>
            value === "active" ? "Đang hiển thị" : "Đang ẩn",
          ),
        },
      ],
      legend: legendRowsForStatuses([
        { label: "🟢", value: "Đang hiển thị" },
        { label: "🔴", value: "Đang ẩn" },
      ]),
      sheets: [
        {
          name: "TrangThaiFAQ",
          rows: countsToChartRows(faqCounts, (value) =>
            value === "active" ? "Đang hiển thị" : "Đang ẩn",
          ).map((row) => ({
            "Trạng thái FAQ": row.label,
            "Số lượng": row.value,
          })),
        },
        {
          name: "DuLieu",
          rows: buildFaqRows(items),
          statusColumns: ["Trạng thái"],
        },
      ],
    },
  );
}

export async function exportAdminTours(items = []) {
  const rows = buildToursRows(items);
  const tourCounts = countBy(items, (item) => item.status);
  return exportWorkbook(
    `travela-tours-${new Date().toISOString().slice(0, 10)}.xlsx`,
    {
      title: "Báo cáo tour Travela",
      metrics: [{ label: "Tổng số tour", value: items.length }],
      charts: [
        {
          title: "Biểu đồ trạng thái tour",
          total: items.length,
          rows: countsToChartRows(tourCounts, (value) =>
            mapLabel("tourStatus", value),
          ),
        },
      ],
      legend: legendRowsForStatuses([
        { label: "🟢", value: "Đang bán" },
        { label: "🟡", value: "Nháp" },
        { label: "🔴", value: "Ngừng bán" },
      ]),
      sheets: [
        {
          name: "TrangThaiTour",
          rows: countsToChartRows(tourCounts, (value) =>
            mapLabel("tourStatus", value),
          ).map((row) => ({
            "Trạng thái tour": row.label,
            "Số lượng": row.value,
          })),
        },
        { name: "DuLieu", rows, statusColumns: ["Trạng thái"] },
      ],
    },
  );
}

export async function exportAdminUsers(filters = {}) {
  const items = await fetchAllPages("/admin/users", filters);
  const roleCounts = countBy(items, (item) => item.role);
  return exportWorkbook(
    `travela-users-${new Date().toISOString().slice(0, 10)}.xlsx`,
    {
      title: "Báo cáo người dùng Travela",
      metrics: [{ label: "Tổng số user", value: items.length }],
      charts: [
        {
          title: "Biểu đồ vai trò",
          total: items.length,
          rows: countsToChartRows(roleCounts, (value) =>
            mapLabel("role", value),
          ),
        },
      ],
      legend: legendRowsForStatuses([
        { label: "🔵", value: "Quản trị viên" },
        { label: "⚪", value: "Người dùng" },
      ]),
      sheets: [
        {
          name: "TheoVaiTro",
          rows: countsToChartRows(roleCounts, (value) =>
            mapLabel("role", value),
          ).map((row) => ({ "Vai trò": row.label, "Số lượng": row.value })),
        },
        {
          name: "DuLieu",
          rows: buildUsersRows(items),
          statusColumns: ["Vai trò", "Trạng thái"],
        },
      ],
    },
  );
}

function normalizeReportValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDateTime(value);
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function reportSummaryRows(summary = {}) {
  return Object.entries(summary || {}).map(([key, value]) => ({
    "Chỉ số": key,
    "Giá trị": normalizeReportValue(value),
  }));
}

function reportInsightRows(insights = []) {
  if (!Array.isArray(insights) || !insights.length) {
    return [
      {
        Loại: "Thông báo",
        "Mức độ": "info",
        "Nội dung": "Không có cảnh báo/insight nổi bật.",
      },
    ];
  }
  return insights.map((item, index) => {
    if (typeof item === "string") {
      return { STT: index + 1, "Nội dung": item };
    }
    return {
      STT: index + 1,
      Loại:
        item.type || item.segment || item.tourName || item.code || "insight",
      "Mức độ": item.severity || "info",
      "Tiêu đề":
        item.title ||
        item.smartSuggestion ||
        item.recommendation ||
        item.segment ||
        "",
      "Nội dung": item.message || item.action || JSON.stringify(item),
      "Gợi ý xử lý":
        item.action || item.smartSuggestion || item.recommendation || "",
    };
  });
}

function reportDataRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length)
    return [{ "Thông báo": "Không có dữ liệu" }];
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row || {}).map(([key, value]) => [
        key,
        normalizeReportValue(value),
      ]),
    ),
  );
}

export async function exportAdminSmartReport(type = "overview", filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const report = await apiFetch(`/admin/dashboard/reports/${type}${suffix}`);
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: report?.title || `Travela ${type} report`,
    Author: "Travela Admin",
    Company: "Travela",
    CreatedDate: new Date(),
  };

  const summaryRows = [
    { "Chỉ số": "Tên báo cáo", "Giá trị": report?.title || type },
    {
      "Chỉ số": "Thời gian xuất",
      "Giá trị": formatDateTime(report?.generatedAt || new Date()),
    },
    ...reportSummaryRows(report?.summary || {}),
  ];

  appendJsonSheet(XLSX, workbook, "Summary", summaryRows);
  appendJsonSheet(
    XLSX,
    workbook,
    "Insights",
    reportInsightRows(report?.insights || []),
    {
      statusColumns: ["Mức độ"],
    },
  );
  appendJsonSheet(XLSX, workbook, "Data", reportDataRows(report?.data || []), {
    statusColumns: [
      "status",
      "bookingStatus",
      "paymentStatus",
      "smartRisk",
      "smartSuggestion",
    ],
  });

  XLSX.writeFile(
    workbook,
    `travela-${type}-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
