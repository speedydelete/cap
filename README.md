
## CAP

Cellular automata pattern language.
If you don't know what cellular automata are, look up Conway's Game of Life.

# Running

You need git, node, and npm.

```sh
git clone https://github.com/speedydelete/cap
cd cap
npm install
npm run build
./capc test.cap
```

# Syntax

```cap

// comments

rule B3/S23 // set rule
include path/to/file.cap // include file

bo$2bo$3o! // glider
bo$2bo$3o! 1 1 // glider at (1, 1)
bo$2bo$3o! R // glider rotated 90 degrees right
// other transformations are:
//     B (180 degrees)
//     L (270 degrees)
//     X (flip around X axis)
//     Y (flip around Y axis)
//     D (flip around diagonal)
//     A (flip around anti-diagonal)
//     T (transpose)

// variables
block = oo$oo!
block 1 2 // block at (1, 2)
// variable names are alphanumeric with underscores, and cannot start with numbers

// brace expansion syntax
{
    block 0 0
    block 3 0
} 2 0
// equivalent to
block 0 0 2 0
block 3 0 2 0
// equivalent to
block 2 0
block 5 0

// groups
[
    block 0 0
    block 3 0
] R
// this merges the RLE's before applying transformations outside of the brackets
// while brace expansion merges the RLE's after applying the transformations outside the brackets

// both brace expansions and groups can be assigned to variables
bi_block = [
    block 0 0
    block 3 0
]

// apgcodes
let blinker = xp2_7
blinker 4 0
// anything matching /^(x[spq]\d+|apg)_/ is an apgcode

// functions
let my_function = { (a, b)
    a 0 0
    b 3 0
}
my_function(block, blinker)

// alternate syntax
function my_function(a, b) {
    a 0 0
    b 3 0
}

// you can also use return (with no argument) to end early

// running patterns
glider @1 2 2 R // glider at generation 1 at (2, 2), rotated right

// imports
import block, blinker from ./library.cap
import switch_engine from https://example.com/switch_engine.rle
import tub, ship from life.cap // no relative/absolute path means standard library, like in JS

```
