import { useEffect } from "react";

export default function AdminFaqRedirectPage() {
  useEffect(() => {
    window.location.replace("/admin");
  }, []);
  return null;
}
