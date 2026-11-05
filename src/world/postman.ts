import * as THREE from 'three';
import { Person } from '../player/person';
import { toon } from './props';
import { addOutlines } from '../render/paint';

/**
 * The postman: a very small man in a green coat who travels by falling out of the sky under an umbrella.
 * He carries the keeper's letters to Nilo, and takes Nilo's letters back.
 */
export interface Postman { root: THREE.Group; person: Person; umbrella: THREE.Group; letter: THREE.Mesh }

export function makePostman(): Postman {
  const root = new THREE.Group();
  const person = new Person({
    height: 0.62, build: 1.15, head: 1.35, skin: '#e8b48c', hair: '#c9c4bc', hairStyle: 'short',
    top: '#e9dfc8', coat: '#3f7a56', coatLen: 0.6, trousers: '#2f3550', boots: '#5a3a24',
    satchel: true, hat: 'cap', hatColor: '#3f7a56', mustache: '#d8d2c8', glasses: true,
  });
  root.add(person.root);
  // the umbrella, held high in the right hand
  const umbrella = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.42, 8, 1, true), toon('#4f9a62'));
  (canopy.material as THREE.Material).side = THREE.DoubleSide;
  canopy.position.y = 0.95; umbrella.add(canopy);
  const lining = new THREE.Mesh(new THREE.ConeGeometry(0.96, 0.38, 8, 1, true), toon('#f2e6c4'));
  lining.position.y = 0.93; lining.userData.noOutline = true; umbrella.add(lining);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), toon('#c8a050')); tip.position.y = 1.18; umbrella.add(tip);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), toon('#3a2a20')); shaft.position.y = 0.45; umbrella.add(shaft);
  umbrella.position.set(0.32, 0.9, 0);
  root.add(umbrella);
  // the letter he hands over
  const letter = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.15), toon('#f4ead2'));
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), toon('#b8483a')); seal.position.y = 0.015; letter.add(seal);
  letter.position.set(-0.22, 0.55, 0.22); letter.visible = false;
  root.add(letter);
  addOutlines(umbrella, '#2e2230', 0.02);
  return { root, person, umbrella, letter };
}
