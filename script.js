
document.addEventListener("DOMContentLoaded", function () {
    // Automatically update the footer year.
    const yearElement = document.getElementById("current-year");

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    // Highlight the current page in the navigation.
    const currentPage =
        window.location.pathname.split("/").pop() || "index.html";

    document.querySelectorAll(".navigation a").forEach(function (link) {
        const linkPage = link.getAttribute("href");

        if (linkPage === currentPage) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });
});
