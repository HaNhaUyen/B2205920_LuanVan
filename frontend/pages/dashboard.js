import { useEffect } from "react";

export default function DashboardRedirectPage() {
  useEffect(() => {
    window.location.replace('/mytour');
  }, []);
  return null;
}
