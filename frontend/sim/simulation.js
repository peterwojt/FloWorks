import * as THREE from 'three'

class Updater {
    constructor(initTime, finalTime, dt) {
        this.initTime = initTime;
        this.finalTime = finalTime;
        this.dt = dt;
    }
}

class Particle extends Updater {
    constructor(x, y, vx, vy, life, force, mass) {
        var pos = THREE.Vector2(x, y);
        var velocity = THREE.Vector2(vx, vy);
        this.life = life;
        this.force = force;
        this.mass = mass;
    }
}
