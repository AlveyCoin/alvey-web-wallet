import insight from '@/libs/nodes/insight'
import alveyInfo from '@/libs/nodes/alveyInfo'

let nodeConfigs = {
    insight,
    alveyInfo
}

const defaultNodeId = 'alveyInfo'
let currentNodeId = defaultNodeId

export default {
    currentNode() {
        return nodeConfigs[currentNodeId]
    },

    setNodeId(nodeId) {
        if (nodeConfigs[nodeId]) {
            currentNodeId = nodeId
        }
    }
}
