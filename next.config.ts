import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // Cloud Run 컨테이너용 최소 번들. `.next/standalone/server.js` 와 그 서버가
  // 실제로 import 하는 node_modules 만 추려낸다 — 이미지에 devDependencies 를
  // 통째로 넣지 않기 위한 것이다.
  //
  // ⚠️ standalone 은 `.next/static` 과 `public/` 을 **복사해 주지 않는다.**
  // Dockerfile 이 그 둘을 따로 COPY 한다. 빠뜨리면 서버는 뜨는데 CSS·JS·아이콘이
  // 전부 404 가 난다.
  output: "standalone",
};

export default nextConfig;
