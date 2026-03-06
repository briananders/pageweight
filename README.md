# Page-weight
Simple node package that calculates the overall weight of a webpage on initial load without click interactions.

supply your URL in the command line, and a viewport width. The script will do the rest.

`$ pageweight https://briananders.com 1440`

The script works by spinning up a headless chrome instance, setting the viewport, and then loading the page. Then, the webpage scrolls down to the bottom of the page at a reasonable rate. While all of this is happening, the script will catalog each asset that is loaded in the browser, along with its overall weight. the output of the script will be a formatted table that lists each artifact, grouped by type, and sorted by overall weight. Different assets will load at different viewport widths, and this script will calculate those values and provide them to you.

The viewport in the chrome instance will always be a square, to simplify the overall computation process. 