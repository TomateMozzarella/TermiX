// Stop only our isolated preview server, including in restricted Windows test
// environments where process-tree enumeration is unavailable.
export default async function stopPreview() {
  await fetch(`http://127.0.0.1:${process.env.TERMIX_TEST_PORT ?? 1429}/__termix_test_shutdown`, {method:'POST', headers:{'x-termix-test-token': process.env.TERMIX_TEST_SERVER_TOKEN}});
}
