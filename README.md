
## CAP

Cellular automata pattern language.

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

// variables
block = oo$oo!
block 1 2 // block at (1, 2)

// functions (no arguments yet)
bi_block = {
    block 0 0
    block 3 0
}
bi_block 1 1

// standard library
includestd life.cap

```
