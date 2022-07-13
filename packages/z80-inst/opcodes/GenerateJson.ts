// This program generates the Opcodes.json source file that contains
// the map from mnemonics to variants of those instructions.
//
//  Top-level JSON object:
//      "mnemonics": Object:
//          mnemonic: Object:    -- key is lower case, like "ld" or "nop".
//              "variants": Array of variants, each an object:
//                  "tokens": array of tokens, like ["a", ",", "nn"], all lower case.
//                  "opcode": array of opcodes for this instruction. Each opcode can be:
//                      A number literal, which is uses as-is as a byte.
//                      "nn", a one-byte literal, from the tokens
//                      "nnnn", a two-byte literal, to be written little endian, from the tokens.
//                      "dd", a one-byte literal, from the tokens.

import * as path from "path";
import * as fs from "fs";
import {toHexByte} from "z80-base";
import {OpcodeVariant, OpcodeTemplate, ClrInstruction, Mnemonics, Instructions} from "../src/OpcodesTypes.js";
import {fileURLToPath} from "url";
import {dirname} from "path";

// Break args into sequences of letters, digits, or single punctuation.
const TOKENIZING_REGEXP = /([a-z]+)'?|([,+()])|([0-9]+)|(;.*)/g;

interface ClrFile {
    instructions: ClrInstruction[];
}

function tokenize(s: string | undefined): string[] {
    if (s === undefined) {
        return [];
    }

    const tokens = [];

    let match;
    while ((match = TOKENIZING_REGEXP.exec(s)) !== null) {
        tokens.push(match[0]);
    }

    return tokens;
}

// Look through the Clr file and find the instruction with this sequence of opcodes.
function findClrInstruction(clr: ClrFile, opcodes: string): ClrInstruction | undefined {
    for (const instruction of clr.instructions) {
        // Remove parameters from clr, we don't insert them ourselves until after this check.
        if (opcodes === instruction.opcodes.replace(/\*+/, "")) {
            return instruction;
        }
    }

    return undefined;
}

function fixClrDescription(desc: string): string {
    return desc
        .replace(/\bpc\b/gi, "PC")
        .replace(/\bsp\b/gi, "SP")
        .replace(/\bhl\b/gi, "HL")
        .replace(/\bbc\b/gi, "BC")
        .replace(/\bde\b/gi, "DE")
        .replace(/\baf\b/gi, "AF")
        .replace(/\ba\b/gi, "A")
        .replace(/\bb\b/gi, "B")
        .replace(/\bc\b/gi, "C")
        .replace(/\bd\b/gi, "D")
        .replace(/\be\b/gi, "E")
        .replace(/\bix\b/gi, "IX")
        .replace(/\biy\b/gi, "IY")
        .replace(/\bixl\b/gi, "IXL")
        .replace(/\biyl\b/gi, "IYL")
        .replace(/\bixh\b/gi, "IXH")
        .replace(/\biyh\b/gi, "IYH")
        .replace(/\bz\b/gi, "Z")
        .replace(/\bF\b/gi, "F")
        .replace(/\bh\b/gi, "H")
        .replace(/\bl\b/gi, "L")
        .replace(/\bcc\b/gi, "CC")

        // Fix mistakes from the "a" conversion above.
        .replace(/\bA byte\b/g, "a byte")
        .replace(/\bA zero\b/g, "a zero")
        .replace(/\bA one\b/g, "a one")
        .replace(/\bA non-maskable\b/g, "a non-maskable")

}

function parseOpcodes(dirname: string, prefix: string, opcodes: OpcodeTemplate[], mnemonicMap: Mnemonics, clr: ClrFile): void {
    const pathname = path.join(dirname, "opcodes_" + prefix.toLowerCase() + ".dat");

    fs.readFileSync(pathname, "utf-8").split(/\r?\n/).forEach((line: string) => {
        line = line.trim();
        if (line.length === 0 || line.startsWith("#")) {
            // Comment or empty line.
            return;
        }

        // Parse line.
        const fields = line.split(/\s+/);
        const opcodeString = fields.length >= 1 ? fields[0] : undefined;
        const mnemonic = fields.length >= 2 ? fields[1].toLowerCase() : undefined;
        const params = fields.length >= 3 ? fields[2].toLowerCase() : undefined;
        const extra = fields.length >= 4 ? fields[3].toLowerCase() : undefined;
        if (fields.length > 4) {
            throw new Error("Invalid opcode line: " + line);
        }

        // TODO make this the basis for the above.
        const newParams = params === undefined
                ? []
                : (params + (extra === undefined ? "" : " " + extra)).split(",");

        if (opcodeString === undefined || opcodeString.length == 0 || !opcodeString.startsWith("0x")) {
            throw new Error("Invalid opcode value: " + line);
        }

        const opcode = parseInt(opcodeString, 16);
        const tokens = tokenize(params).concat(tokenize(extra));

        // Special case: "RST 10" really means 10 hex, so convert it to decimal.
        if (mnemonic === "rst") {
            tokens[0] = parseInt(tokens[0], 16).toString(10);
        }

        const fullOpcodes: OpcodeTemplate[] = opcodes.concat([opcode]);

        if (mnemonic === undefined) {
            // Fallthrough to next line. These are for different opcodes that map to the
            // same instruction. Just use the last one, any will do.
        } else {
            if (mnemonic === "shift") {
                // Recurse for shifted instructions.
                if (params === undefined) {
                    throw new Error("Shift must have params");
                }
                parseOpcodes(dirname, params, fullOpcodes, mnemonicMap, clr);
            } else {
                const fullOpcodesString = fullOpcodes.map(value => typeof(value) === "number" ? toHexByte(value) : "**").join("");
                const clrInst = findClrInstruction(clr, fullOpcodesString);
                if (clrInst === undefined) {
                    console.log("Didn't find " + fullOpcodesString + " in clr");
                } else {
                    // Fix up description to convert register names to upper case.
                    clrInst.description = fixClrDescription(clrInst.description);
                }

                // Add parameters.
                for (const token of tokens) {
                    if (token === "nn" || token === "nnnn" || token === "dd" || token === "offset") {
                        // For DDCB and FDCB instructions, the parameter is in the third position, not at the end.
                        if (fullOpcodes.length === 3 && (fullOpcodes[0] === 0xDD || fullOpcodes[0] === 0xFD) && fullOpcodes[1] === 0xCB) {
                            fullOpcodes.splice(2, 0, token);
                        } else {
                            fullOpcodes.push(token);
                        }
                    }
                }

                // Find mnemonic in map, adding if necessary.
                let mnemonicInfo = mnemonicMap[mnemonic] as any;
                if (mnemonicInfo === undefined) {
                    mnemonicInfo = {
                        variants: [],
                    };
                    mnemonicMap[mnemonic] = mnemonicInfo;
                }

                // Generate this variant.
                let variant: OpcodeVariant = {
                    mnemonic: mnemonic,
                    params: newParams,
                    tokens: tokens,
                    opcodes: fullOpcodes,
                    isPseudo: false,
                    clr: clrInst ?? undefined,
                };
                mnemonicInfo.variants.push(variant);

                // For instructions like "ADD A,C", also produce "ADD C" with an implicit "A".
                if (tokens.length > 2 && tokens[0] === "a" && tokens[1] === ",") {
                    variant = Object.assign({}, variant, {
                        params: variant.params.slice(1),
                        tokens: variant.tokens.slice(2),
                        isPseudo: true,
                    });
                    mnemonicInfo.variants.push(variant);
                }

                // The canonical instruction is "JP HL" but some people write it as "JP (HP)".
                if (mnemonic === "jp" && variant.params.length === 1 && variant.params[0] === "hl") {
                    variant = Object.assign({}, variant, {
                        params: ["(hl)"],
                        tokens: ["(", "hl", ")"],
                        isPseudo: true,
                    });
                    mnemonicInfo.variants.push(variant);
                }
            }
        }
    });
}

/**
 * Add fake convenience instructions.
 *
 * https://k1.spdns.de/Develop/Projects/zasm/Documentation/z79.htm#G
 */
function addPseudoInstructions(mnemonics: Mnemonics) {
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["hl", "bc"],
        tokens: ["hl", ",", "bc"],
        opcodes: [0x60, 0x69],
        isPseudo: true,
        clr: undefined,
    });
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["bc", "hl"],
        tokens: ["bc", ",", "hl"],
        opcodes: [0x44, 0x4D],
        isPseudo: true,
        clr: undefined,
    });
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["de", "hl"],
        tokens: ["de", ",", "hl"],
        opcodes: [0x54, 0x5D],
        isPseudo: true,
        clr: undefined,
    });
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["hl", "de"],
        tokens: ["hl", ",", "de"],
        opcodes: [0x62, 0x6B],
        isPseudo: true,
        clr: undefined,
    });
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["bc", "(hl)"],
        tokens: ["bc", ",", "(", "hl", ")"],
        opcodes: [0x4E, 0x23, 0x46, 0x2B],
        isPseudo: true,
        clr: undefined,
    })
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["(hl)", "bc"],
        tokens: ["(", "hl", ")", ",", "bc"],
        opcodes: [0x71, 0x23, 0x70, 0x2B],
        isPseudo: true,
        clr: undefined,
    })
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["(hl)", "de"],
        tokens: ["(", "hl", ")", ",", "de"],
        opcodes: [0x73, 0x23, 0x72, 0x2B],
        isPseudo: true,
        clr: undefined,
    })
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["de", "bc"],
        tokens: ["de", ",", "bc"],
        opcodes: [0x50, 0x59],
        isPseudo: true,
        clr: undefined,
    })
}

function makeVariantVariableName(variant: OpcodeVariant): string {
    return "variant_" + variant.opcodes.map(v => typeof(v) === "number" ? toHexByte(v) : v).join("_") +
        (variant.isPseudo ? "_pseudo" : "");
}

function makeVariantLabel(variant: OpcodeVariant): string {
    return (variant.mnemonic + " " + variant.params.join(",")).trim();
}

function generateCode(mnemonics: Mnemonics): {variantCode: string[], mnemonicMapCode: string[], opcodeMapCode: string[]} {
    const variantCode: string[] = [];
    const mnemonicMapCode: string[] = [];
    const opcodeMapCode: string[] = [];

    mnemonicMapCode.push("// Map from mnemonic to array of variants.");
    mnemonicMapCode.push("export const mnemonicMap = new Map<string,OpcodeVariant[]>([");

    opcodeMapCode.push("// Map from opcode to variant or sub-map.");
    opcodeMapCode.push("export const opcodeMap = new Map<number,OpcodeVariant>([");

    for (const mnemonic in mnemonics) {
        const mnemonicInfo = mnemonics[mnemonic];
        const variants = mnemonicInfo.variants;

        mnemonicMapCode.push("  [");
        mnemonicMapCode.push("    \"" + mnemonic + "\",");
        mnemonicMapCode.push("    [");

        for (const variant of variants) {
            const variableName = makeVariantVariableName(variant);
            const label = makeVariantLabel(variant);

            variantCode.push("");
            variantCode.push("// " + label);
            variantCode.push("const " + variableName + ": OpcodeVariant = " + JSON.stringify(variant, null, 2) + ";");

            mnemonicMapCode.push("      " + variableName + ", // " + label);

            if (variant.opcodes.length === 1 && !variant.isPseudo) {
                opcodeMapCode.push("  [ 0x" + toHexByte(variant.opcodes[0] as number) + ", " +  variableName + " ], // " + label);
            }
        }

        mnemonicMapCode.push("    ],");
        mnemonicMapCode.push("  ],");
    }

    mnemonicMapCode.push("]);");
    opcodeMapCode.push("]);");

    return {variantCode, mnemonicMapCode, opcodeMapCode};
}

function generateOpcodes(): void {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const opcodesDir = path.join(scriptDir, "..", "..");
    const clr = JSON.parse(fs.readFileSync(path.join(opcodesDir, "clr.json"), "utf-8")) as ClrFile;

    // Read the opcodes text files and generate all variants.
    const mnemonics: Mnemonics = {
        // To be filled in later.
    };
    parseOpcodes(opcodesDir, "base", [], mnemonics, clr);
    addPseudoInstructions(mnemonics);

    // Generate variables and indexes.
    const { variantCode, mnemonicMapCode, opcodeMapCode } = generateCode(mnemonics);
    const text = [
        '// Generated by GenerateJson.ts. Do not modify.',
        '',
        'import {Instructions, OpcodeMap, OpcodeVariant} from "./OpcodesTypes.js";',
        ... variantCode,
        '',
        ... mnemonicMapCode,
        '',
        ... opcodeMapCode,
        '',
    ];

    fs.writeFileSync("src/Opcodes.ts", text.join("\n"));
}

generateOpcodes();
