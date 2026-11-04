"use client";

import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

export default function BackButton({
  fallback = "/",
  className = "btn btn-ghost mv-back",
  children = "Back",
}) {
  const router = useRouter();

  const onClick = () => {
    const sameSite =
      document.referrer && document.referrer.startsWith(window.location.origin);
    if (sameSite && window.history.length > 1) router.back();
    else router.push(fallback);
  };

  return (
    <button type="button" className={className} onClick={onClick}>
      <Icon icon={ArrowLeft01Icon} size={20} />
      {children}
    </button>
  );
}