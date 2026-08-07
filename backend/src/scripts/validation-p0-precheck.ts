import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const prisma = new PrismaClient();

async function main() {
  const [
    duplicateActiveRefunds,
    invalidCapacityRows,
    duplicateEmailRows,
    duplicateIdentityRows,
    overusedVoucherRows,
  ] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`
      SELECT booking_id AS bookingId, COUNT(*) AS activeRefundCount
      FROM refund_requests
      WHERE status IN ('pending', 'approved')
      GROUP BY booking_id
      HAVING COUNT(*) > 1
    `),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT id, tour_id AS tourId, total_slots AS totalSlots,
             booked_slots AS bookedSlots, held_slots AS heldSlots
      FROM tour_departures
      WHERE booked_slots < 0
         OR held_slots < 0
         OR booked_slots + held_slots > total_slots
    `),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT LOWER(TRIM(email)) AS normalizedEmail, COUNT(*) AS duplicateCount
      FROM users
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) > 1
    `),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT TRIM(identity_number) AS identityNumber, COUNT(*) AS duplicateCount
      FROM users
      WHERE identity_number IS NOT NULL AND TRIM(identity_number) <> ''
      GROUP BY TRIM(identity_number)
      HAVING COUNT(*) > 1
    `),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT id, code, quota, used_count AS usedCount
      FROM vouchers
      WHERE quota > 0 AND used_count > quota
    `),
  ]);

  const sections = [
    ["Duplicate active refunds", duplicateActiveRefunds],
    ["Invalid departure capacity", invalidCapacityRows],
    ["Duplicate normalized emails", duplicateEmailRows],
    ["Duplicate identity numbers", duplicateIdentityRows],
    ["Voucher usedCount greater than quota", overusedVoucherRows],
  ];

  const hasBlockingIssue = sections.some(([, rows]) => (rows as any[]).length > 0);
  const lines = [
    "# Migration Precheck Report",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    hasBlockingIssue
      ? "Status: Blocked - resolve reported data issues before running risky migrations."
      : "Status: Passed - no blocking data issue found for current P0 checks.",
    "",
  ];

  for (const [title, rows] of sections) {
    lines.push(`## ${title}`, "");
    if (!(rows as any[]).length) {
      lines.push("No issue found.", "");
      continue;
    }
    lines.push("```json", JSON.stringify(rows, bigintJsonReplacer, 2), "```", "");
  }

  const reportPath = resolve(process.cwd(), "..", "docs", "MIGRATION_PRECHECK_REPORT.md");
  writeFileSync(reportPath, lines.join("\n"), { encoding: "utf8" });

  if (hasBlockingIssue) {
    process.exitCode = 1;
  }
}

function bigintJsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
