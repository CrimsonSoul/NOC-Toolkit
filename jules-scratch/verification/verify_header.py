from playwright.sync_api import sync_playwright

def run(playwright):
    electron_app = playwright.chromium.launch(
        executable_path="./node_modules/.bin/electron",
        args=["."],
        headless=True
    )

    # Get the first window that the app opens
    page = electron_app.contexts[0].pages[0]
    page.wait_for_load_state()

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/verification.png")

    # Close the app
    electron_app.close()


with sync_playwright() as playwright:
    run(playwright)