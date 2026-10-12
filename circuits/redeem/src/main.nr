// QOURA redeem circuit: proves that the prover holds one credit of face value `face` in the
// credit tree with root `root`, without saying which one.
//
//   commitment = Poseidon2(nullifier, secret)
//   leaf       = Poseidon2(commitment, face)          (written on-chain by QouraCreditDesk)
//   spend_tag  = Poseidon1(nullifier)                 (recorded once by the gateway)
//   key_binding = sha256(api key) >> 8                (ties the proof to one API key)
//
// Poseidon is the circomlib-compatible BN254 instance, shared with QouraTwinHash and
// poseidon-lite (vectors pinned in the tests of all three).

use poseidon::poseidon::bn254::{hash_1, hash_2};

pub global DEPTH: u32 = 20;
global FACE_MAX: u32 = 1000;

fn credit_leaf(nullifier: Field, secret: Field, face: Field) -> Field {
    hash_2([hash_2([nullifier, secret]), face])
}

fn root_of(leaf: Field, path_elements: [Field; DEPTH], path_indices: [Field; DEPTH]) -> Field {
    let mut node = leaf;
    for i in 0..DEPTH {
        let bit = path_indices[i];
        assert(bit * (1 - bit) == 0, "path index is not a bit");
        let sibling = path_elements[i];
        // bit = 0: node is the left child; bit = 1: node is the right child.
        let left = node + bit * (sibling - node);
        let right = sibling + bit * (node - sibling);
        node = hash_2([left, right]);
    }
    node
}

fn main(
    root: pub Field,
    face: pub Field,
    spend_tag: pub Field,
    key_binding: pub Field,
    nullifier: Field,
    secret: Field,
    path_elements: [Field; DEPTH],
    path_indices: [Field; DEPTH],
) {
    face.assert_max_bit_size::<16>();
    let f = face as u32;
    assert((f >= 1) & (f <= FACE_MAX), "face out of range");
    // The binding is a 248-bit value; constraining its size keeps it a real input of the statement.
    key_binding.assert_max_bit_size::<248>();
    assert(spend_tag == hash_1([nullifier]), "spend tag mismatch");
    let leaf = credit_leaf(nullifier, secret, face);
    assert(root_of(leaf, path_elements, path_indices) == root, "credit is not in the tree");
}

#[test]
fn poseidon_vectors() {
    // circomlib reference values, shared with the Solidity and TypeScript tests.
    assert(hash_2([1, 2]) == 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a);
    assert(hash_1([1]) == 0x29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133);
}

fn empty_path() -> [Field; DEPTH] {
    let mut path = [0; DEPTH];
    let mut z = 0;
    for l in 0..DEPTH {
        path[l] = z;
        z = hash_2([z, z]);
    }
    path
}

#[test]
fn redeems_first_and_second_leaf() {
    let path = empty_path();
    let a = credit_leaf(11, 22, 25);
    let b = credit_leaf(33, 44, 25);
    // Leaf 0 alone.
    let root = root_of(a, path, [0; DEPTH]);
    main(root, 25, hash_1([11]), 12345, 11, 22, path, [0; DEPTH]);
    // Two leaves: prove leaf 1 (right child at level 0).
    let mut p1 = path;
    p1[0] = a;
    let mut bits = [0; DEPTH];
    bits[0] = 1;
    let root2 = root_of(b, p1, bits);
    main(root2, 25, hash_1([33]), 2.pow_32(247) + 5, 33, 44, p1, bits);
}

#[test(should_fail_with = "credit is not in the tree")]
fn rejects_wrong_face() {
    let path = empty_path();
    let root = root_of(credit_leaf(11, 22, 25), path, [0; DEPTH]);
    main(root, 50, hash_1([11]), 1, 11, 22, path, [0; DEPTH]);
}

#[test(should_fail_with = "spend tag mismatch")]
fn rejects_wrong_spend_tag() {
    let path = empty_path();
    let root = root_of(credit_leaf(11, 22, 25), path, [0; DEPTH]);
    main(root, 25, hash_1([12]), 1, 11, 22, path, [0; DEPTH]);
}

#[test(should_fail_with = "face out of range")]
fn rejects_face_zero() {
    let path = empty_path();
    let root = root_of(credit_leaf(11, 22, 0), path, [0; DEPTH]);
    main(root, 0, hash_1([11]), 1, 11, 22, path, [0; DEPTH]);
}

#[test(should_fail_with = "face out of range")]
fn rejects_face_above_max() {
    let path = empty_path();
    let root = root_of(credit_leaf(11, 22, 1001), path, [0; DEPTH]);
    main(root, 1001, hash_1([11]), 1, 11, 22, path, [0; DEPTH]);
}

#[test(should_fail)]
fn rejects_wide_key_binding() {
    let path = empty_path();
    let root = root_of(credit_leaf(11, 22, 25), path, [0; DEPTH]);
    main(root, 25, hash_1([11]), 2.pow_32(248), 11, 22, path, [0; DEPTH]);
}

#[test(should_fail_with = "path index is not a bit")]
fn rejects_non_bit_index() {
    let path = empty_path();
    let mut bits = [0; DEPTH];
    bits[3] = 2;
    let root = root_of(credit_leaf(11, 22, 25), path, [0; DEPTH]);
    main(root, 25, hash_1([11]), 1, 11, 22, path, bits);
}
