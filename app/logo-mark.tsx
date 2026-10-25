import Image from "next/image";
import styles from "./logo-mark.module.css";

export default function LogoMark({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/listening-party-logo.png"
      alt="Famous Introvert Records"
      width={42}
      height={42}
      className={`${styles.logo} ${className}`.trim()}
    />
  );
}